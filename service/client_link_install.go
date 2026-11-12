package service

import (
	"net/url"
	"strings"
)

// The install scripts merge the downloaded config into the user's WorkBuddy
// models.json without an AI client: the user pastes one shell command.
// They keep the guide's safety rules: byte backup first, downloaded entries
// first, drop only entries whose url host is this site, keep everything else.

const installShTemplate = `#!/bin/sh
# {{HOST}} WorkBuddy one-step installer. Run in Terminal; nothing is sent anywhere.
set -eu
w=$(cat "$HOME/.workbuddy/device-id" 2>/dev/null || cat "$HOME/.workbuddy-ai/device-id" 2>/dev/null || true)
h=$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | awk -F'"' '/IOPlatformUUID/{print $4}')
[ -n "$h" ] || h=$(cat /proc/registry/HKEY_LOCAL_MACHINE/SOFTWARE/Microsoft/Cryptography/MachineGuid 2>/dev/null | tr -d '\0\r\n')
printf 'X-Client-Os: %s\nX-Client-Wb: %s\nX-Client-Hw: %s\n' "$(uname -s)" "$w" "$h" > "$HOME/.newapi-device"
c=$(curl -sS --max-time 30 -H "@$HOME/.newapi-device" "{{BASE}}/c/{{CODE}}/code?t=workbuddy") || { echo "网络连不上 {{HOST}}，请稍后再试"; rm -f "$HOME/.newapi-device"; exit 1; }
case "$c" in k-*) ;; *) echo "$c"; rm -f "$HOME/.newapi-device"; exit 1;; esac
http=$(curl -sS --max-time 60 -w "%{http_code}" -o "$HOME/.newapi-new.json" -H "@$HOME/.newapi-device" "{{BASE}}/k/$c/models.json")
rm -f "$HOME/.newapi-device"
if [ "$http" != "200" ]; then head -c 300 "$HOME/.newapi-new.json" 2>/dev/null; echo; rm -f "$HOME/.newapi-new.json"; echo "下载失败（$http），请回到网页重新复制命令"; exit 1; fi
osascript -l JavaScript - "$HOME/.newapi-new.json" <<'JSEOF'
ObjC.import('Foundation')
function run(argv) {
  const fs = $.NSFileManager.defaultManager
  const home = $.NSProcessInfo.processInfo.environment.objectForKey('HOME').js
  const body = $.NSString.stringWithContentsOfFileEncodingError(argv[0], $.NSUTF8StringEncoding, null).js
  const fresh = JSON.parse(body)
  const dirs = ['.workbuddy', '.workbuddy-ai'].map(d => home + '/' + d).filter(d => fs.fileExistsAtPath(d))
  const targets = dirs.length ? dirs : [home + '/.workbuddy']
  const read = p => {
    // JXA error refs are always objects with isNil(); check the result instead.
    const s = $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null)
    return s && !s.isNil() ? s.js : null
  }
  const write = (p, s) => $.NSString.stringWithString(s).writeToFileAtomicallyEncodingError(p, true, $.NSUTF8StringEncoding, null)
  const backup = p => {
    const b = p + '.backup-' + $.NSDate.date.timeIntervalSince1970.toFixed(0)
    fs.copyItemAtPathToPathError(p, b, null)
    return b
  }
  const host = '{{HOST}}'
  const report = []
  for (const dir of targets) {
    const p = dir + '/models.json'
    let old = read(p), oldArr = []
    if (old != null) {
      try { const j = JSON.parse(old); oldArr = Array.isArray(j) ? j : (Array.isArray(j.models) ? j.models : null) } catch (e) { oldArr = null }
      if (oldArr === null) { report.push(dir + ': 原文件不是合法 JSON，已用新配置替换（备份在同目录）'); backup(p) }
    }
    if (old != null && oldArr !== null) {
      backup(p)
      const keep = oldArr.filter(m => { try { return !(m && typeof m.url === 'string' && new URL(m.url).hostname === host) } catch (e) { return true } })
      const ids = new Set(fresh.map(m => m.id))
      if (keep.some(m => m && ids.has(m.id))) { report.push(dir + ': 已有同 id 的其他模型，未改动'); continue }
      const out = fresh.concat(keep)
      const tmp = p + '.tmp'
      write(tmp, JSON.stringify(out))
      const check = JSON.parse(read(tmp))
      if (check.length !== out.length) { report.push(dir + ': 校验失败，未改动'); continue }
      fs.removeItemAtPathError(tmp, null)
      fs.removeItemAtPathError(p, null)
      write(p, JSON.stringify(out))
      report.push(dir + ': 写入 ' + fresh.length + ' 个模型，保留 ' + keep.length + ' 个原有模型')
    } else if (old == null) {
      fs.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(dir, true, null, null)
      write(p, JSON.stringify(fresh))
      report.push(dir + ': 新建 models.json，写入 ' + fresh.length + ' 个模型')
    }
  }
  return report.join('\n')
}
JSEOF
rm -f "$HOME/.newapi-new.json"
echo "完成。请在 WorkBuddy 的模型列表里选择新模型。"
`

const installPs1Template = `# {{HOST}} WorkBuddy one-step installer. Paste into PowerShell; nothing is sent anywhere.
$ErrorActionPreference = 'Stop'
$w = (Get-Content "$HOME\.workbuddy\device-id","$HOME\.workbuddy-ai\device-id" -TotalCount 1 -ErrorAction SilentlyContinue | Select-Object -First 1)
$h = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography').MachineGuid
[IO.File]::WriteAllLines("$HOME\.newapi-device", [string[]]("X-Client-Os: Windows","X-Client-Wb: $w","X-Client-Hw: $h"))
$c = (curl.exe -sS --max-time 30 -H "@$HOME\.newapi-device" "{{BASE}}/c/{{CODE}}/code?t=workbuddy")
if (-not ($c -like 'k-*')) { echo $c; Remove-Item "$HOME\.newapi-device" -ErrorAction SilentlyContinue; exit 1 }
$http = curl.exe -sS --max-time 60 -w "%{http_code}" -o "$HOME\.newapi-new.json" -H "@$HOME\.newapi-device" "{{BASE}}/k/$c/models.json"
Remove-Item "$HOME\.newapi-device" -ErrorAction SilentlyContinue
if ($http -ne '200') { Get-Content "$HOME\.newapi-new.json" -TotalCount 1; Remove-Item "$HOME\.newapi-new.json" -ErrorAction SilentlyContinue; echo "下载失败（$http），请回到网页重新复制命令"; exit 1 }
$dirs = @("$HOME\.workbuddy","$HOME\.workbuddy-ai") | Where-Object { Test-Path $_ }
if (-not $dirs) { $dirs = @("$HOME\.workbuddy") }
$fresh = [IO.File]::ReadAllText("$HOME\.newapi-new.json") | ConvertFrom-Json
$host_ = '{{HOST}}'
foreach ($dir in $dirs) {
  $p = Join-Path $dir 'models.json'
  $oldArr = $null
  if (Test-Path $p) {
    Copy-Item $p ($p + '.backup-' + (Get-Date -Format 'yyyyMMddHHmmss'))
    try {
      $old = Get-Content $p -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($old -is [array]) { $oldArr = $old } elseif ($old.models) { $oldArr = $old.models }
    } catch { $oldArr = $null }
  }
  if ($oldArr -ne $null) {
    $keep = @($oldArr | Where-Object { -not ($_.url -and ([Uri]::new($_.url).Host -eq $host_)) })
    $ids = @{}; foreach ($m in $fresh) { $ids[$m.id] = $true }
    $conflict = $keep | Where-Object { $_.id -and $ids.ContainsKey($_.id) }
    if ($conflict) { echo "$dir: 已有同 id 的其他模型，未改动"; continue }
    $out = @($fresh) + @($keep)
    $json = ConvertTo-Json @($out) -Depth 20 -Compress
    [IO.File]::WriteAllText($p, $json, (New-Object Text.UTF8Encoding $false))
    echo "$dir: 写入 $($fresh.Count) 个模型，保留 $($keep.Count) 个原有模型"
  } else {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Copy-Item "$HOME\.newapi-new.json" $p -Force
    echo "$dir: 新建 models.json，写入 $($fresh.Count) 个模型"
  }
}
Remove-Item "$HOME\.newapi-new.json" -ErrorAction SilentlyContinue
echo "完成。请在 WorkBuddy 的模型列表里选择新模型。"
`

// ClientLinkInstallScript renders the one-step installer for a target. It never contains a key.
// The code is pasted into a shell, so anything but a plain code is rejected.
func ClientLinkInstallScript(target, base, code string) (string, error) {
	if target != "workbuddy" {
		return "", ErrClientLinkUnavailable
	}
	if !clientLinkCodePattern.MatchString(code) {
		return "", ErrClientLinkUnavailable
	}
	host := base
	if u, err := url.Parse(base); err == nil && u.Host != "" {
		host = u.Hostname()
	}
	return strings.NewReplacer(
		"{{BASE}}", base, "{{CODE}}", code, "{{HOST}}", host,
	).Replace(installShTemplate), nil
}

// ClientLinkInstallScriptPS1 renders the Windows PowerShell installer.
func ClientLinkInstallScriptPS1(base, code string) (string, error) {
	if !clientLinkCodePattern.MatchString(code) {
		return "", ErrClientLinkUnavailable
	}
	host := base
	if u, err := url.Parse(base); err == nil && u.Host != "" {
		host = u.Hostname()
	}
	return strings.NewReplacer(
		"{{BASE}}", base, "{{CODE}}", code, "{{HOST}}", host,
	).Replace(installPs1Template), nil
}
