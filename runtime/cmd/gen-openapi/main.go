package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/orbit-tauri-tools/runtime/internal/server"
)

func main() {
	check := flag.Bool("check", false, "fail if any runtime routes are missing from OpenAPI paths")
	flag.Parse()

	spec := server.BuildOpenAPISpec()

	if *check {
		missing := missingPaths(spec)
		if len(missing) > 0 {
			for _, p := range missing {
				fmt.Fprintf(os.Stderr, "missing openapi path: %s\n", p)
			}
			os.Exit(2)
		}
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(spec); err != nil {
		fmt.Fprintf(os.Stderr, "encode openapi: %v\n", err)
		os.Exit(1)
	}
}

func missingPaths(spec map[string]any) []string {
	paths, _ := spec["paths"].(map[string]any)
	if paths == nil {
		paths = map[string]any{}
	}

	data, err := os.ReadFile("internal/server/server.go")
	if err != nil {
		return []string{fmt.Sprintf("cannot read internal/server/server.go: %v", err)}
	}

	// naive extract: s.mux.HandleFunc("/path", ...)
	re := regexp.MustCompile(`HandleFunc\("([^"]+)"`)
	matches := re.FindAllStringSubmatch(string(data), -1)

	seen := map[string]bool{}
	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		p := strings.TrimSpace(m[1])
		if p == "" {
			continue
		}
		seen[p] = true
	}

	var missing []string
	for p := range seen {
		// skip swagger UI endpoints; they are not API endpoints
		if p == "/swagger" || p == "/swagger/" || p == "/openapi.json" {
			continue
		}
		// server handles prefix-style endpoints; in spec we expose explicit variants
		if strings.HasSuffix(p, "/") {
			continue
		}
		if _, ok := paths[p]; ok {
			continue
		}
		// allow /v1/dicts/ to be documented as templated paths
		if p == "/v1/dicts/" {
			continue
		}
		// allow /v1/plugins/market/ to be documented as /v1/plugins/market and templated install/update paths
		if p == "/v1/plugins/market/" {
			continue
		}
		// allow /v2/runtime/ and /v2/plugins/ to be documented by explicit subpaths
		if p == "/v2/runtime/" || p == "/v2/plugins/" {
			continue
		}
		missing = append(missing, p)
	}

	return missing
}

