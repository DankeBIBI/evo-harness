package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Updater 升级检查器(REFACTOR-FRONTEND-MIGRATION Phase 5)
// 职责: 检查远端最新版本 / 下载新包;版本源与下载地址由前端 settings 提供。
type Updater struct {
	ctx context.Context
}

// New 创建升级器
func New() *Updater {
	return &Updater{}
}

// Start 保存 context 供后续 UI 通知使用
func (u *Updater) Start(ctx context.Context) {
	u.ctx = ctx
}

// ReleaseInfo 远端发布信息
type ReleaseInfo struct {
	Tag    string `json:"tag_name"`
	URL    string `json:"html_url"`
	Assets []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
	} `json:"assets"`
}

// Check 检查最新版本(repoURL 形如 owner/repo;timeout 秒)
func (u *Updater) Check(repoURL string, timeout int) (*ReleaseInfo, error) {
	if repoURL == "" {
		return nil, fmt.Errorf("repoURL 为空")
	}
	apiURL := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", repoURL)
	client := &http.Client{Timeout: time.Duration(timeout) * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("check release failed: %d", resp.StatusCode)
	}
	var info ReleaseInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, err
	}
	return &info, nil
}

// Download 下载新包到目标目录(targetDir 不存在则创建),返回保存路径
func (u *Updater) Download(url, targetDir string, timeout int) (string, error) {
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return "", err
	}
	name := filepath.Base(url)
	dest := filepath.Join(targetDir, name)

	client := &http.Client{Timeout: time.Duration(timeout) * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download failed: %d", resp.StatusCode)
	}

	out, err := os.Create(dest)
	if err != nil {
		return "", err
	}
	defer out.Close()
	if _, err := io.Copy(out, resp.Body); err != nil {
		return "", err
	}
	return dest, nil
}

// Notify UI 提示有可用更新
func (u *Updater) Notify(title, message string) {
	if u.ctx == nil {
		return
	}
	runtime.MessageDialog(u.ctx, runtime.MessageDialogOptions{
		Type:    runtime.InfoDialog,
		Title:   title,
		Message: message,
	})
}
