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

const clientLinkCodingGuide = `# {HOST}：给 {PRODUCT} 的配置步骤
只在用户自己的电脑上做，只改当前登录用户自己的配置。不要发送任何模型请求或连通性测试；不要在回复、终端输出或日志里显示 Key、下载文件内容或含 Key 的链接；不要用读文件工具打开 $HOME/.newapi-{FILE}；本页只读一次，后面的命令照原样执行。

第 1 步：确认操作系统、当前实际登录的用户，以及是否已安装 CC Switch 和 {PRODUCT}。不要写管理员、SYSTEM、其他用户或 WSL 的目录。

第 2 步：执行下面这条命令，把本次账户配置下载到 $HOME/.newapi-{FILE}。它先输出一行下载码，再输出三位状态码：
zsh / bash：w=""; h=$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | awk -F'"' '/IOPlatformUUID/{print $4}'); [ -n "$h" ] || h=$(cat /etc/machine-id 2>/dev/null); {HEADER}; c=$(curl -sS --max-time 30 -H "@$HOME/.newapi-device" "{BASE}/c/{CODE}/code?t={TARGET}") && echo "$c" && curl -sS --max-time 60 -w "%{http_code}" -o "$HOME/.newapi-{FILE}" -H "@$HOME/.newapi-device" "{BASE}/k/$c/{FILE}"
PowerShell（Windows）：$w = ""; $h = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography').MachineGuid; [IO.File]::WriteAllLines("$HOME/.newapi-device", [string[]]("X-Client-Os: Windows","X-Client-Wb: $w","X-Client-Hw: $h")); $c = (curl.exe -sS --max-time 30 -H "@$HOME/.newapi-device" "{BASE}/c/{CODE}/code?t={TARGET}"); echo $c; curl.exe -sS --max-time 60 -w "%{http_code}" -o "$HOME/.newapi-{FILE}" -H "@$HOME/.newapi-device" "{BASE}/k/$c/{FILE}"
· 第一行以 k- 开头才是下载码，状态码 200 才继续；否则把那一行中文提示原样回复给用户，删掉下载文件和 .newapi-device，什么都不改。连不上可重试一次；仍失败就回复「网络连不上 {HOST}，请稍后再发一次」。
· 下载 JSON 里的 api_key 是敏感值，只在本地脚本变量中使用。base_url、models、default_model 是普通配置值。

第 3 步：按下面的方式配置。无论选哪种方式，都要先备份再合并；不要直接修改 CC Switch 的数据库或它管理的文件。
{CONFIG_INSTRUCTIONS}
通用写入规则：先把原文件按原字节备份到同目录唯一文件名；用本机已有的 JSON/TOML 解析器读取和合并，没有解析器就停下，不要下载或安装新工具。其他设置（MCP、权限、Skills、其他供应商、项目信任等）原样保留。写到同目录临时文件后原子替换，macOS/Linux 权限设为 600；写完读回并重新解析核对。任何一步失败都保留或恢复原文件，并告诉用户原因。脚本只输出路径、备份位置和布尔核对结果。

第 4 步：不管前面哪一步结束，回复用户之前都删掉 $HOME/.newapi-{FILE}、$HOME/.newapi-device 和临时文件。告诉用户用了哪种方式、改了哪张 CC Switch 卡片或哪个文件、备份在哪里、核对了什么。配置成功不等于实际对话成功，提醒用户自己发一条消息试试。
`

const clientLinkClaudeInstructions = `已安装 CC Switch：从下载 JSON 在本地拼出 ccswitch://v1/import 导入链接，每个参数值都做 URL 编码，再用系统命令打开（macOS：open；Windows PowerShell：Start-Process；Linux：xdg-open）。参数：resource=provider，app=claude，name={HOST} Claude，endpoint=base_url（不要加 /v1），apiKey=api_key，model=default_model，opusModel=opus_model，sonnetModel=sonnet_model，haikuModel=haiku_model，homepage={BASE}，enabled=false。请用户核对名称、地址和型号后自己点「导入」，是否立即切换也由用户决定。不要把含 Key 的链接打印出来。
没有 CC Switch：合并当前用户主目录下 .claude/settings.json。env 里写 ANTHROPIC_BASE_URL=base_url（不要加 /v1）、ANTHROPIC_AUTH_TOKEN=api_key、ANTHROPIC_MODEL=default_model、ANTHROPIC_DEFAULT_OPUS_MODEL=opus_model、ANTHROPIC_DEFAULT_SONNET_MODEL=sonnet_model、ANTHROPIC_DEFAULT_HAIKU_MODEL=haiku_model；删掉 env 里冲突的旧 ANTHROPIC_API_KEY。不要新增 modelPicker，models 只作为用户选模型的参考。`

const clientLinkCodexInstructions = `已安装 CC Switch：从下载 JSON 在本地拼出 ccswitch://v1/import 导入链接，每个参数值都做 URL 编码，再用系统命令打开（macOS：open；Windows PowerShell：Start-Process；Linux：xdg-open）。参数：resource=provider，app=codex，name={HOST} Codex，endpoint=base_url，apiKey=api_key，model=default_model，homepage={BASE}，enabled=false。请用户核对名称、地址和型号后自己点「导入」，是否立即切换也由用户决定。不要把含 Key 的链接打印出来。
没有 CC Switch：合并当前用户主目录下 .codex/config.toml。顶层写 model_provider="newapi"、model=default_model；表 [model_providers.newapi] 写 name="{HOST}"、base_url=base_url、wire_api="responses"、experimental_bearer_token=api_key。不要把表名写成 openai，不要覆盖用户原有的其他供应商、模型或思考档位。`

var clientLinkCodePattern = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)

// ClientLinkGuide renders the plain-text steps an AI client reads. It never contains a key.
// The code is pasted into text an AI will obey, so anything but a plain code is rejected.
func ClientLinkGuide(target, base, code string) (string, error) {
	text := clientLinkWorkBuddyGuide
	product, file, instructions := "", "", ""
	switch target {
	case "workbuddy":
	case "dsh":
		text = clientLinkDshGuide
	case "claude":
		text = clientLinkCodingGuide
		product, file, instructions = "Claude Code", "claude-code.json", clientLinkClaudeInstructions
	case "codex":
		text = clientLinkCodingGuide
		product, file, instructions = "Codex", "codex.json", clientLinkCodexInstructions
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
	instructions = strings.NewReplacer("{HOST}", host, "{BASE}", base).Replace(instructions)
	return strings.NewReplacer(
		"{PROBE}", clientLinkDeviceProbe, "{HEADER}", clientLinkDeviceHeader,
		"{BASE}", base, "{CODE}", code, "{HOST}", host,
		"{PRODUCT}", product, "{FILE}", file, "{TARGET}", target,
		"{CONFIG_INSTRUCTIONS}", instructions,
	).Replace(text), nil
}
