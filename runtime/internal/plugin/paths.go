package plugin

import (
	"os"
	"path/filepath"
	"strings"
)

// UserPluginsDir returns the per-user plugin directory for imported feeds.
func UserPluginsDir() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, "Orbit Reader", "plugins"), nil
}

// DiscoverDirs returns plugin scan directories in priority order.
func DiscoverDirs() ([]string, error) {
	seen := make(map[string]struct{})
	var dirs []string

	add := func(p string) {
		p = filepath.Clean(p)
		if p == "" || p == "." {
			return
		}
		if _, ok := seen[p]; ok {
			return
		}
		if st, err := os.Stat(p); err == nil && st.IsDir() {
			seen[p] = struct{}{}
			dirs = append(dirs, p)
		}
	}

	if env := strings.TrimSpace(os.Getenv("ORBIT_PLUGINS_DIR")); env != "" {
		for _, part := range filepath.SplitList(env) {
			add(part)
		}
	}

	if userDir, err := UserPluginsDir(); err == nil {
		add(userDir)
	}

	if exe, err := os.Executable(); err == nil {
		add(filepath.Join(filepath.Dir(exe), "plugins"))
	}

	return dirs, nil
}
