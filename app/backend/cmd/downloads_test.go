package cmd

import "testing"

func TestIsInstaller_CountsInstallersNotUpdaterTraffic(t *testing.T) {
	cases := map[string]bool{
		"zcrypt-windows-x64-setup.exe":           true,
		"zcrypt_0.2.0_x64-setup.exe":             true,
		"zcrypt_0.2.0_x64_en-US.msi":             true,
		"zcrypt_0.2.0_aarch64.dmg":               true,
		"zcrypt-linux-amd64.AppImage":            true,
		"zcrypt_0.2.0_amd64.deb":                 true,
		"zcrypt-0.2.0-1.x86_64.rpm":              true,
		"zcrypt.apk":                             true,
		"latest.json":                            false,
		"zcrypt_0.2.0_x64-setup.exe.sig":         false,
		"zcrypt_0.2.0_amd64.AppImage.sig":        false,
		"zcrypt_aarch64-apple-darwin.app.tar.gz": false,
		"zcrypt_x86_64-apple-darwin.app.tar.gz":  false,
		"zcrypt_0.2.0_x64_en-US.msi.zip":         false,
	}
	for name, want := range cases {
		if got := isInstaller(name); got != want {
			t.Errorf("isInstaller(%q) = %v, want %v", name, got, want)
		}
	}
}
