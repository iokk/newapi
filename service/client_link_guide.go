package service

import (
	"net/url"
	"regexp"
	"strings"
)

// shortcut: guide text is Chinese only (the WorkBuddy / DSH audience); add i18n for other markets.
// Device headers must match the names read in controller/client_link.go.
const clientLinkDeviceHeader = `printf 'X-Client-Os: %s\nX-Client-Wb: %s\nX-Client-Hw: %s\n' "$(uname -s)" "$w" "$h" > "$HOME/.newapi-device"`

const clientLinkDeviceProbe = `w=$(cat "$HOME/.workbuddy/device-id" 2>/dev/null || cat "$HOME/.workbuddy-ai/device-id" 2>/dev/null); h=$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | awk -F'"' '/IOPlatformUUID/{print $4}'); [ -n "$h" ] || h=$(cat /proc/registry/HKEY_LOCAL_MACHINE/SOFTWARE/Microsoft/Cryptography/MachineGuid 2>/dev/null | tr -d '\0\r\n'); `

const clientLinkWorkBuddyGuide = `# {HOST}：给 WorkBuddy 的配置步骤
只在用户自己的电脑上做。不要发送任何模型请求或连通性测试；不要在回复里显示 Key 或文件内容；不要用读文件工具打开 models.json 或 .newapi-new.json（里面有 Key），合并请用脚本处理；本页只读一次，后面的命令照原样执行。

第 1 步：当前系统必须是 macOS 或 Windows，并且当前用户目录下有 .workbuddy 或 .workbuddy-ai 文件夹（.workbuddy-ai 是国际版）。两个都没有就什么都不做，只回复：
「这一步要在你的电脑上做。请在手机 WorkBuddy 里选择设备为电脑（不要选云端模式），再发一次；也可以把那句话发到微信「文件传输助手」，在电脑上粘贴给 WorkBuddy。」
下面说的「配置目录」是这两个文件夹里实际存在的，两个都在就两个都做。

第 2 步：执行下面这条命令（读取设备信息、换取下载码并下载配置），不要删改其中任何一段。它先输出一行码，再输出下载的三位状态码：
zsh / bash（macOS，或 Windows 的 Git Bash）：{PROBE}{HEADER}; c=$(curl -sS --max-time 30 -H "@$HOME/.newapi-device" "{BASE}/c/{CODE}/code?t=workbuddy") && echo "$c" && curl -sS --max-time 60 -w "%{http_code}" -o "$HOME/.newapi-new.json" -H "@$HOME/.newapi-device" "{BASE}/k/$c/models.json"
PowerShell（Windows）：$w = (Get-Content "$HOME/.workbuddy/device-id","$HOME/.workbuddy-ai/device-id" -TotalCount 1 -ErrorAction SilentlyContinue | Select-Object -First 1); $h = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography').MachineGuid; [IO.File]::WriteAllLines("$HOME/.newapi-device", [string[]]("X-Client-Os: Windows","X-Client-Wb: $w","X-Client-Hw: $h")); $c = (curl.exe -sS --max-time 30 -H "@$HOME/.newapi-device" "{BASE}/c/{CODE}/code?t=workbuddy"); echo $c; curl.exe -sS --max-time 60 -w "%{http_code}" -o "$HOME/.newapi-new.json" -H "@$HOME/.newapi-device" "{BASE}/k/$c/models.json"
· 第一行以 k- 开头才是码。不是：把第一行原样回复给用户，删掉 .newapi-new.json 和 .newapi-device，什么都不改。没有输出（连不上、超时）：整条命令再执行一次；还不行就回复「网络连不上 {HOST}，请稍后再发一次」，什么都不改。
· 状态码 200：继续第 3 步。
· 状态码是其他三位数：.newapi-new.json 里最多只有一行中文提示，不含 Key，可以读出来原样回复给用户；然后删掉 .newapi-new.json 和 .newapi-device，什么都不改。
· 状态码 000 或命令报错：整条命令再执行一次（会换一个新码）；还不行就回复「网络连不上 {HOST}，请稍后再发一次」。

第 3 步：对每个配置目录分别处理它下面的 models.json（路径一律用 $HOME，不要写 ~ 或 %USERPROFILE%）：
· models.json 不存在，或内容只有 []：把 .newapi-new.json 复制为 models.json，这个目录就做完了。
· 否则先把 models.json 按原字节复制为同目录 models.json.backup-<当前时间>，并核对备份与原文件一致；备份失败这个目录就什么都不改，记下「电脑上的配置文件没法备份，没有改动，请联系客服」。
· 再用脚本合并。两个文件都可能是顶层数组或 {"models":[...]}（取里面的数组）。原文件不是合法 JSON 时，能明确修复的在副本上修复；修不了就保留备份，直接用 .newapi-new.json 换上 models.json。规则：下载文件的条目按原顺序放最前面；后面按原顺序接原文件的条目，但去掉 url 主机名为 {HOST} 的旧条目（那是本站以前写入的）；其他供应商的条目一个字段都不改。去掉后如果原文件里还有和下载文件同 id 的条目，这个目录什么都不改，记下「电脑上已有同名的其他模型，没有改动，请联系客服」。
· 结果写成顶层数组，无 BOM 的 UTF-8，保留全部嵌套层级（reasoning、contextWindow 里的数组不能变成字符串）。先写同目录临时文件并核对：能解析、id 不重复、条目数等于下载条目数加保留的原条目数、前面的条目与 .newapi-new.json 逐字段一致、后面的条目与原文件对应条目逐字段一致；核对通过再替换 models.json，保留原文件权限，替换后读回再核对一遍；任何一步失败就恢复原文件，记下「电脑上的配置文件没法写入，没有改动，请联系客服」。脚本只输出条目数和核对结果，不输出文件内容。
· 工具：macOS 用 osascript -l JavaScript，不要用 python3；有 node 命令时 macOS 和 Windows 都可以用 node；Windows 没有 node 时用 PowerShell，ConvertTo-Json 必须带 -Depth 20，不要用 Set-Content、Out-File 或 >。

第 4 步：不管前面哪一步结束（成功、失败或中途停下），回复用户之前都删掉 $HOME/.newapi-new.json、$HOME/.newapi-device 和临时文件。至少改成一个目录时回复「已经配置好了，请在 WorkBuddy 的模型列表里选择新模型。」，有目录没改成的，另起一行加上记下的那句；一个都没改成就只回复记下的那句。
`

const clientLinkDshGuide = `# {HOST}：给 DeepSeek Harness（dsh）的配置步骤
只在用户自己的电脑上做，只改当前用户自己的 dsh 配置，不要改别的程序和权限模式等其他设置。不要发送任何模型请求；不要在回复里显示 Key 或文件内容，也不要打印到终端；不要用读文件工具打开 .credentials.yaml 或 .newapi-dsh.json；合并和核对请用脚本处理；本页只读一次，后面的命令照原样执行。

第 1 步：确认操作系统（macOS、Windows 或 Linux）和当前用户。配置目录 DSH_HOME：有环境变量 DSH_HOME 就用它，否则是用户主目录下的 .dsh。配置名 profile：以 DSH_HOME/profiles 下实际存在的目录为准（桌面版是 desktop，网页版是 web），两个都有就两个都改；一个都没有就什么都不做，回复「没有找到 dsh 的配置目录，请先打开一次 dsh」。

第 2 步：执行下面这条命令，下载配置到 $HOME/.newapi-dsh.json。它先输出一行码，再输出三位状态码：
zsh / bash：w=$(cat "$HOME/.dsh/device-id" 2>/dev/null); h=$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | awk -F'"' '/IOPlatformUUID/{print $4}'); [ -n "$h" ] || h=$(cat /etc/machine-id 2>/dev/null); [ -n "$w" ] || w=$h; {HEADER}; c=$(curl -sS --max-time 30 -H "@$HOME/.newapi-device" "{BASE}/c/{CODE}/code?t=dsh") && echo "$c" && curl -sS --max-time 60 -w "%{http_code}" -o "$HOME/.newapi-dsh.json" -H "@$HOME/.newapi-device" "{BASE}/k/$c/dsh.json"
PowerShell（Windows）：$h = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography').MachineGuid; [IO.File]::WriteAllLines("$HOME/.newapi-device", [string[]]("X-Client-Os: Windows","X-Client-Wb: $h","X-Client-Hw: $h")); $c = (curl.exe -sS --max-time 30 -H "@$HOME/.newapi-device" "{BASE}/c/{CODE}/code?t=dsh"); echo $c; curl.exe -sS --max-time 60 -w "%{http_code}" -o "$HOME/.newapi-dsh.json" -H "@$HOME/.newapi-device" "{BASE}/k/$c/dsh.json"
· 第一行以 k- 开头才是码，状态码 200 才继续；否则把第一行或 .newapi-dsh.json 里那一行中文提示原样回复给用户（不含 Key），删掉 .newapi-dsh.json 和 .newapi-device，什么都不改。连不上就整条命令再执行一次，还不行回复「网络连不上 {HOST}，请稍后再发一次」。

第 3 步：.newapi-dsh.json 是 {"key_env","api_key","providers_yaml"} 三个字符串。对每个 profile 写两个文件，写入规则：先把原文件按原字节备份到同目录唯一文件名；合并后写同目录临时文件，再原子替换；写完读回核对；任何一步失败恢复原文件。本机有 YAML 解析器（Python、Node、Ruby 等）就用它核对，没有就不要下载或安装新工具。Windows 上用 Node 写脚本，不要用 PowerShell 5.1；没有 node 时用 dsh 桌面版自带的：设环境变量 ELECTRON_RUN_AS_NODE=1，再用 DeepSeek Harness.exe 运行脚本。
1. 凭据文件 DSH_HOME/.credentials.yaml：顶层 version: 1；在 refs 下写 key_env 的名字，值为 api_key（已有就替换）。records 和其他 refs 原样保留；文件不存在就新建。macOS 和 Linux 要把它和临时文件的权限设为 600，并在读回时核对。
2. 模型文件 DSH_HOME/profiles/<profile>/cordis.patch.yml：这是一个 YAML 数组。找到 id: llm-pi-ai 的那一项；没有就在数组末尾新增一项（id: llm-pi-ai，name: "@deepseek-ai/dsh-llm-pi-ai"，config: {}）。把 providers_yaml 里出现的每个供应商键，整体换成片段内容挂到它的 config.providers 下（没有就新增）；其他供应商、其他项和文件开头的注释原样保留。
核对时只输出：改了哪些文件、备份路径，以及凭据里该值与 api_key 是否一致（在脚本里比较，不要显示值）。

第 4 步：不管前面哪一步结束，回复用户之前都删掉 $HOME/.newapi-dsh.json、$HOME/.newapi-device 和临时文件。成功时回复：「已经配置好了，不需要重启。在输入框下方的模型选择里选本站的型号，新开一个会话发条消息试试。」失败时回复失败原因。
`

var clientLinkCodePattern = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)

// ClientLinkGuide renders the plain-text steps an AI client reads. It never contains a key.
// The code is pasted into text an AI will obey, so anything but a plain code is rejected.
func ClientLinkGuide(target, base, code string) (string, error) {
	text := clientLinkWorkBuddyGuide
	switch target {
	case "workbuddy":
	case "dsh":
		text = clientLinkDshGuide
	default:
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
		"{PROBE}", clientLinkDeviceProbe, "{HEADER}", clientLinkDeviceHeader,
		"{BASE}", base, "{CODE}", code, "{HOST}", host,
	).Replace(text), nil
}
