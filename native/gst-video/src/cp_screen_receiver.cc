#include "cp_screen_receiver.h"

#include <errno.h>
#include <glib.h>
#include <glib-unix.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

extern "C" {
#include "cp_video_nal.h"
#include "livi_aead.h"
}

#define CP_HEADER_LEN 128
#define CP_OP_VIDEO_FRAME 0
#define CP_OP_VIDEO_CONFIG 1
#define CP_MAX_BODY (8u * 1024u * 1024u)

struct CpScreenReceiver {
  int server_fd;
  int client_fd;
  guint server_source;
  guint client_source;
  uint8_t key[32];
  uint64_t counter;
  GByteArray* acc;
  bool started;
  CpScreenCallbacks cb;
  uint8_t* plain;
  size_t plain_cap;
};

static void reset_stream(CpScreenReceiver* r) {
  if (r->acc) g_byte_array_set_size(r->acc, 0);
  r->counter = 0;
  r->started = false;
}

static void close_client(CpScreenReceiver* r) {
  if (r->client_source) {
    g_source_remove(r->client_source);
    r->client_source = 0;
  }
  if (r->client_fd >= 0) {
    close(r->client_fd);
    r->client_fd = -1;
  }
  reset_stream(r);
}

static void process_message(CpScreenReceiver* r, const uint8_t* header, const uint8_t* body,
                            size_t body_len) {
  uint8_t opcode = header[4];

  if (opcode == CP_OP_VIDEO_CONFIG) {
    const uint8_t* cd = NULL;
    size_t cd_len = 0;
    CpCodec codec = cp_detect_codec(body, body_len, &cd, &cd_len);
    if (r->cb.on_config) r->cb.on_config((int)codec, cd, cd_len, r->cb.user);
    return;
  }

  if (opcode != CP_OP_VIDEO_FRAME) return;

  const uint8_t* nal = body;
  size_t nal_len = body_len;
  if (body_len >= 16) {
    uint8_t nonce[12];
    memset(nonce, 0, sizeof(nonce));
    uint64_t c = r->counter;
    for (int i = 0; i < 8; i++) nonce[4 + i] = (uint8_t)(c >> (8 * i));

    size_t need = body_len - 16;
    if (need > r->plain_cap) {
      uint8_t* grown = (uint8_t*)realloc(r->plain, need);
      if (!grown) return;
      r->plain = grown;
      r->plain_cap = need;
    }
    size_t got = 0;
    if (livi_chacha20poly1305_open(r->plain, &got, r->key, nonce, header, CP_HEADER_LEN, body,
                                   body_len) != 0) {
      fprintf(stderr, "[cp_screen] frame auth failed at counter %llu\n",
              (unsigned long long)r->counter);
      return;
    }
    r->counter++;
    nal = r->plain;
    nal_len = got;
  }

  if (!r->started) {
    r->started = true;
    if (r->cb.on_started) r->cb.on_started(r->cb.user);
  }

  if (r->cb.on_frame) r->cb.on_frame(nal, nal_len, r->cb.user);
}

static gboolean on_client_readable(gint fd, GIOCondition cond, gpointer data) {
  CpScreenReceiver* r = (CpScreenReceiver*)data;
  if (cond & (G_IO_HUP | G_IO_ERR)) {
    close_client(r);
    return G_SOURCE_REMOVE;
  }
  uint8_t chunk[65536];
  ssize_t n = read(fd, chunk, sizeof(chunk));
  if (n <= 0) {
    close_client(r);
    return G_SOURCE_REMOVE;
  }
  g_byte_array_append(r->acc, chunk, (guint)n);

  for (;;) {
    if (r->acc->len < CP_HEADER_LEN) break;
    uint32_t body_size = (uint32_t)r->acc->data[0] | ((uint32_t)r->acc->data[1] << 8) |
                         ((uint32_t)r->acc->data[2] << 16) | ((uint32_t)r->acc->data[3] << 24);
    if (body_size > CP_MAX_BODY) {
      fprintf(stderr, "[cp_screen] implausible bodySize %u, dropping connection\n", body_size);
      close_client(r);
      return G_SOURCE_REMOVE;
    }
    if (r->acc->len < (guint)CP_HEADER_LEN + body_size) break;
    process_message(r, r->acc->data, r->acc->data + CP_HEADER_LEN, body_size);
    g_byte_array_remove_range(r->acc, 0, CP_HEADER_LEN + body_size);
  }
  return G_SOURCE_CONTINUE;
}

static gboolean on_server_readable(gint fd, GIOCondition cond, gpointer data) {
  CpScreenReceiver* r = (CpScreenReceiver*)data;
  (void)cond;
  int cfd = accept(fd, NULL, NULL);
  if (cfd < 0) return G_SOURCE_CONTINUE;
  if (r->client_fd >= 0) {
    close(cfd);
    return G_SOURCE_CONTINUE;
  }
  int one = 1;
  setsockopt(cfd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof(one));
  reset_stream(r);
  r->client_fd = cfd;
  r->client_source =
    g_unix_fd_add(cfd, (GIOCondition)(G_IO_IN | G_IO_HUP | G_IO_ERR), on_client_readable, r);
  fprintf(stderr, "[cp_screen] video data connection accepted\n");
  return G_SOURCE_CONTINUE;
}

CpScreenReceiver* cp_screen_receiver_new(const uint8_t key[32], const CpScreenCallbacks* cb,
                                         uint16_t* out_port) {
  int fd = socket(AF_INET6, SOCK_STREAM, 0);
  if (fd < 0) return NULL;
  int off = 0;
  setsockopt(fd, IPPROTO_IPV6, IPV6_V6ONLY, &off, sizeof(off));
  int one = 1;
  setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));

  struct sockaddr_in6 addr;
  memset(&addr, 0, sizeof(addr));
  addr.sin6_family = AF_INET6;
  addr.sin6_addr = in6addr_any;
  addr.sin6_port = 0;
  if (bind(fd, (struct sockaddr*)&addr, sizeof(addr)) != 0 || listen(fd, 1) != 0) {
    close(fd);
    return NULL;
  }
  struct sockaddr_in6 bound;
  socklen_t bl = sizeof(bound);
  if (getsockname(fd, (struct sockaddr*)&bound, &bl) != 0) {
    close(fd);
    return NULL;
  }

  CpScreenReceiver* r = (CpScreenReceiver*)calloc(1, sizeof(*r));
  if (!r) {
    close(fd);
    return NULL;
  }
  r->server_fd = fd;
  r->client_fd = -1;
  memcpy(r->key, key, 32);
  r->acc = g_byte_array_new();
  r->cb = *cb;
  r->server_source = g_unix_fd_add(fd, (GIOCondition)(G_IO_IN), on_server_readable, r);

  if (out_port) *out_port = ntohs(bound.sin6_port);
  return r;
}

void cp_screen_receiver_free(CpScreenReceiver* r) {
  if (!r) return;
  if (r->server_source) g_source_remove(r->server_source);
  if (r->client_source) g_source_remove(r->client_source);
  if (r->client_fd >= 0) close(r->client_fd);
  if (r->server_fd >= 0) close(r->server_fd);
  if (r->acc) g_byte_array_free(r->acc, TRUE);
  free(r->plain);
  free(r);
}
