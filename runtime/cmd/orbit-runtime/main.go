package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"os"

	"github.com/orbit-tauri-tools/runtime/internal/server"
	"github.com/orbit-tauri-tools/runtime/internal/store"
)

func listenAddr() string {
	if p := os.Getenv("ORBIT_PORT"); p != "" {
		return "127.0.0.1:" + p
	}
	return "127.0.0.1:0"
}

func main() {
	ln, err := net.Listen("tcp", listenAddr())
	if err != nil {
		log.Fatalf("listen: %v", err)
	}

	port := ln.Addr().(*net.TCPAddr).Port
	fmt.Println(server.ReadyLine(port))
	_ = os.Stdout.Sync()

	st, err := store.Open()
	if err != nil {
		log.Fatalf("store: %v", err)
	}
	defer st.Close()

	srv := server.New(st)
	httpServer := &http.Server{Handler: srv.Handler()}

	log.Printf("orbit-runtime %s listening on 127.0.0.1:%d", server.Version, port)
	if err := httpServer.Serve(ln); err != nil && err != http.ErrServerClosed {
		log.Fatalf("serve: %v", err)
	}
}
