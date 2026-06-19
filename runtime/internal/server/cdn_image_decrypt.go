package server

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"fmt"
	"image/jpeg"
	"net/url"
	"strings"
)

const (
	lbupupDecryptKey = "f5d965df75336270"
	lbupupDecryptIV  = "97b60394abc2fbe1"
	lbupupReferer    = "https://away.vmkbnoiat.cc/"
	bgezuwDecryptKey      = "2019ysapp7527"
	bgezuwMaxHeaderScan   = 2048
)

func isLbupupImageHost(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "pic.lbupup.cn" || strings.HasSuffix(host, ".lbupup.cn") {
		return true
	}
	return host == "pic.uforxk.cn" || strings.HasSuffix(host, ".uforxk.cn")
}

func needsLbupupDecrypt(target *url.URL) bool {
	return target != nil && isLbupupImageHost(target.Hostname())
}

func isBgezuwImageHost(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	return host == "llksqimg.bgezuw.cn" || strings.HasSuffix(host, ".bgezuw.cn")
}

func needsBgezuwDecrypt(target *url.URL) bool {
	return target != nil && isBgezuwImageHost(target.Hostname())
}

func lbupupImageReferer(target *url.URL) string {
	if needsLbupupDecrypt(target) {
		return lbupupReferer
	}
	return imageProxyReferer(target)
}

func decryptLbupupImage(ciphertext []byte) ([]byte, error) {
	if len(ciphertext) >= 2 && ciphertext[0] == 0xFF && ciphertext[1] == 0xD8 {
		return ciphertext, nil
	}
	if len(ciphertext) >= 8 && string(ciphertext[:8]) == "\x89PNG\r\n\x1a\n" {
		return ciphertext, nil
	}
	if len(ciphertext) == 0 || len(ciphertext)%aes.BlockSize != 0 {
		return nil, fmt.Errorf("invalid encrypted image size")
	}

	block, err := aes.NewCipher([]byte(lbupupDecryptKey))
	if err != nil {
		return nil, err
	}

	plain := make([]byte, len(ciphertext))
	cipher.NewCBCDecrypter(block, []byte(lbupupDecryptIV)).CryptBlocks(plain, ciphertext)

	pad := int(plain[len(plain)-1])
	if pad <= 0 || pad > aes.BlockSize || pad > len(plain) {
		return nil, fmt.Errorf("invalid image padding")
	}
	for i := 0; i < pad; i++ {
		if plain[len(plain)-1-i] != byte(pad) {
			return nil, fmt.Errorf("invalid image padding bytes")
		}
	}
	return plain[:len(plain)-pad], nil
}

func xorBgezuwHeader(ciphertext, key []byte, headerEnd int) []byte {
	plain := make([]byte, len(ciphertext))
	copy(plain, ciphertext)
	for i := 0; i < headerEnd && i < len(plain); i++ {
		plain[i] = ciphertext[i] ^ key[i%len(key)]
	}
	return plain
}

func isDecodableBgezuwJPEG(data []byte) bool {
	if len(data) < 2 || data[0] != 0xFF || data[1] != 0xD8 {
		return false
	}
	_, err := jpeg.Decode(bytes.NewReader(data))
	return err == nil
}

func bgezuwPlaintextMarkerEnd(ciphertext []byte) int {
	if dqt := bytes.Index(ciphertext, []byte{0xFF, 0xDB}); dqt > 0 {
		return dqt
	}
	for _, marker := range []byte{0xC0, 0xC1, 0xC2} {
		if idx := bytes.Index(ciphertext, []byte{0xFF, marker}); idx > 0 {
			return idx
		}
	}
	return -1
}

func bgezuwEncryptedHeaderEnd(ciphertext, key []byte) (int, error) {
	if markerEnd := bgezuwPlaintextMarkerEnd(ciphertext); markerEnd > 0 {
		if isDecodableBgezuwJPEG(xorBgezuwHeader(ciphertext, key, markerEnd)) {
			return markerEnd, nil
		}
	}

	maxScan := bgezuwMaxHeaderScan
	if maxScan > len(ciphertext) {
		maxScan = len(ciphertext)
	}

	best := -1
	for n := len(key); n <= maxScan; n++ {
		if isDecodableBgezuwJPEG(xorBgezuwHeader(ciphertext, key, n)) {
			best = n
		}
	}
	if best < 0 {
		return 0, fmt.Errorf("invalid bgezuw image: unable to detect header size")
	}
	return best, nil
}

func decryptBgezuwImage(ciphertext []byte) ([]byte, error) {
	if len(ciphertext) >= 2 && ciphertext[0] == 0xFF && ciphertext[1] == 0xD8 {
		return ciphertext, nil
	}

	key := []byte(bgezuwDecryptKey)
	headerEnd, err := bgezuwEncryptedHeaderEnd(ciphertext, key)
	if err != nil {
		return nil, err
	}

	plain := xorBgezuwHeader(ciphertext, key, headerEnd)
	if len(plain) < 2 || plain[0] != 0xFF || plain[1] != 0xD8 {
		return nil, fmt.Errorf("invalid bgezuw image after decrypt")
	}
	return plain, nil
}

func maybeDecryptProxyImage(target *url.URL, body []byte) ([]byte, string, error) {
	contentType := contentTypeFromImagePath(target.Path)
	if needsBgezuwDecrypt(target) {
		plain, err := decryptBgezuwImage(body)
		if err != nil {
			return nil, "", err
		}
		return plain, contentType, nil
	}
	if needsLbupupDecrypt(target) {
		plain, err := decryptLbupupImage(body)
		if err != nil {
			return nil, "", err
		}
		return plain, contentType, nil
	}
	return body, contentType, nil
}
