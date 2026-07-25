#ifndef CP_SCREEN_RECEIVER_H
#define CP_SCREEN_RECEIVER_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct CpScreenReceiver CpScreenReceiver;

typedef struct {
  void (*on_config)(int codec, const uint8_t* atom, size_t len, void* user);
  void (*on_frame)(const uint8_t* nal, size_t len, void* user);
  void (*on_started)(void* user);
  void* user;
} CpScreenCallbacks;

CpScreenReceiver* cp_screen_receiver_new(const uint8_t key[32], const CpScreenCallbacks* cb,
                                         uint16_t* out_port);

void cp_screen_receiver_free(CpScreenReceiver* r);

#ifdef __cplusplus
}
#endif

#endif
