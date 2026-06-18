package server

import (
	"crypto/aes"
	"crypto/cipher"
	"fmt"
	"net/url"
	"strings"
)

const (
	lbupupDecryptKey = "f5d965df75336270"
	lbupupDecryptIV  = "97b60394abc2fbe1"
	lbupupReferer    = "https://away.vmkbnoiat.cc/"
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

func maybeDecryptProxyImage(target *url.URL, body []byte) ([]byte, string, error) {
	contentType := contentTypeFromImagePath(target.Path)
	if !needsLbupupDecrypt(target) {
		return body, contentType, nil
	}

	plain, err := decryptLbupupImage(body)
	if err != nil {
		return nil, "", err
	}
	return plain, contentType, nil
}
