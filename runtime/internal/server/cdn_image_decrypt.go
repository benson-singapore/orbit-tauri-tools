package server

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"fmt"
	"image/jpeg"
	"net/url"
	"path/filepath"
	"strings"

	"golang.org/x/image/webp"
)

const (
	lbupupDecryptKey = "f5d965df75336270"
	lbupupDecryptIV  = "97b60394abc2fbe1"
	lbupupReferer    = "https://away.vmkbnoiat.cc/"
	bgezuwDecryptKey = "2019ysapp7527"
	bgezuwDecryptLen = 100
	bgezuwEncryptKey = 163
)

var bgezuwEncryptMagicNumber = []byte{136, 168, 48, 203, 16, 118}

func isLbupupImageHost(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "pic.lbupup.cn" || strings.HasSuffix(host, ".lbupup.cn") {
		return true
	}
	if host == "pic.uforxk.cn" || strings.HasSuffix(host, ".uforxk.cn") {
		return true
	}
	return host == "pic.ssyxpo.cn" || strings.HasSuffix(host, ".ssyxpo.cn")
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

	// AES-128-CBC with NoPadding: return CBC output as-is (JPEG/PNG tolerate trailing pad).
	plain := make([]byte, len(ciphertext))
	cipher.NewCBCDecrypter(block, []byte(lbupupDecryptIV)).CryptBlocks(plain, ciphertext)
	return plain, nil
}

func xorBgezuwHeader(ciphertext, key []byte, headerEnd int) []byte {
	plain := make([]byte, len(ciphertext))
	copy(plain, ciphertext)
	for i := 0; i < headerEnd && i < len(plain); i++ {
		plain[i] = ciphertext[i] ^ key[i%len(key)]
	}
	return plain
}

func xorBgezuwAll(ciphertext []byte, xorKey byte) []byte {
	plain := make([]byte, len(ciphertext))
	copy(plain, ciphertext)
	for i := range plain {
		if i < len(bgezuwEncryptMagicNumber) && ciphertext[i] == bgezuwEncryptMagicNumber[i] {
			continue
		}
		plain[i] ^= xorKey
	}
	return plain
}

func isBgezuwWebPBytes(data []byte) bool {
	return len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP"
}

func isDecodableBgezuwJPEG(data []byte) bool {
	if len(data) < 2 || data[0] != 0xFF || data[1] != 0xD8 {
		return false
	}
	_, err := jpeg.Decode(bytes.NewReader(data))
	return err == nil
}

func isDecodableBgezuwWebP(data []byte) bool {
	if !isBgezuwWebPBytes(data) {
		return false
	}
	_, err := webp.Decode(bytes.NewReader(data))
	return err == nil
}

func isDecodableBgezuwImage(data []byte, webpTarget bool) bool {
	if webpTarget {
		return isDecodableBgezuwWebP(data)
	}
	return isDecodableBgezuwJPEG(data)
}

func isBgezuwWebPTarget(path string) bool {
	return strings.EqualFold(filepath.Ext(path), ".webp")
}

func decryptBgezuwImage(ciphertext []byte, path string) ([]byte, error) {
	webpTarget := isBgezuwWebPTarget(path)
	if !webpTarget && len(ciphertext) >= 2 && ciphertext[0] == 0xFF && ciphertext[1] == 0xD8 {
		return ciphertext, nil
	}
	if webpTarget && isBgezuwWebPBytes(ciphertext) && isDecodableBgezuwWebP(ciphertext) {
		return ciphertext, nil
	}

	if bytes.HasPrefix(ciphertext, bgezuwEncryptMagicNumber) {
		plain := xorBgezuwAll(ciphertext, bgezuwEncryptKey)
		if !isDecodableBgezuwImage(plain, webpTarget) {
			return nil, fmt.Errorf("invalid bgezuw image after full decrypt")
		}
		return plain, nil
	}

	plain := xorBgezuwHeader(ciphertext, []byte(bgezuwDecryptKey), bgezuwDecryptLen)
	if !isDecodableBgezuwImage(plain, webpTarget) {
		return nil, fmt.Errorf("invalid bgezuw image after fixed-length decrypt")
	}
	return plain, nil
}

func maybeDecryptProxyImage(target *url.URL, body []byte) ([]byte, string, error) {
	contentType := contentTypeFromImagePath(target.Path)
	if needsBgezuwDecrypt(target) {
		plain, err := decryptBgezuwImage(body, target.Path)
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
