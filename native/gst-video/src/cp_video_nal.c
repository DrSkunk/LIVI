#include "cp_video_nal.h"

static int looks_like_avcc(const uint8_t* a, size_t n) {
  if (n < 9) return 0;
  if ((a[5] & 0x1f) < 1) return 0;
  size_t sps_len = ((size_t)a[6] << 8) | a[7];
  if (8 + sps_len > n) return 0;
  return (a[8] & 0x1f) == 7;
}

CpCodec cp_detect_codec(const uint8_t* payload, size_t payload_len,
                        const uint8_t** codec_data, size_t* codec_data_len) {
  for (size_t i = 4; i + 4 <= payload_len; i++) {
    if (payload[i] == 'h' && payload[i + 1] == 'v' && payload[i + 2] == 'c' && payload[i + 3] == 'C') {
      *codec_data = payload + i + 4;
      *codec_data_len = payload_len - (i + 4);
      return CP_CODEC_H265;
    }
    if (payload[i] == 'a' && payload[i + 1] == 'v' && payload[i + 2] == 'c' && payload[i + 3] == 'C') {
      *codec_data = payload + i + 4;
      *codec_data_len = payload_len - (i + 4);
      return CP_CODEC_H264;
    }
  }
  *codec_data = payload;
  *codec_data_len = payload_len;
  return looks_like_avcc(payload, payload_len) ? CP_CODEC_H264 : CP_CODEC_H265;
}

static CpNalKind classify_byte(uint8_t header_byte, CpCodec codec) {
  if (codec == CP_CODEC_H265) {
    int t = (header_byte >> 1) & 0x3f;
    if (t >= 16 && t <= 23) return CP_NAL_KEYFRAME;
    if (t >= 32 && t <= 34) return CP_NAL_PARAMS;
    return CP_NAL_DELTA;
  }
  int t = header_byte & 0x1f;
  if (t == 5) return CP_NAL_KEYFRAME;
  if (t == 7 || t == 8) return CP_NAL_PARAMS;
  return CP_NAL_DELTA;
}

CpNalKind cp_classify_nal(const uint8_t* frame, size_t frame_len, CpCodec codec) {
  CpNalKind best = CP_NAL_DELTA;
  size_t off = 0;
  while (off + 4 <= frame_len) {
    uint32_t nlen = ((uint32_t)frame[off] << 24) | ((uint32_t)frame[off + 1] << 16) |
                    ((uint32_t)frame[off + 2] << 8) | (uint32_t)frame[off + 3];
    off += 4;
    if (nlen == 0 || off + nlen > frame_len) break;
    CpNalKind k = classify_byte(frame[off], codec);
    if (k > best) best = k;
    off += nlen;
  }
  return best;
}
