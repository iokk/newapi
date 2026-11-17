/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
export type ManualClient = 'claude-code' | 'codex'
export type ManualOs = 'macos' | 'windows' | 'linux'

export function manualSetup(input: {
  client: ManualClient
  os: ManualOs
  baseUrl: string
  apiKey: string
}): { steps: string[]; command: string } {
  const origin = input.baseUrl.replace(/\/$/, '')
  const claude = input.client === 'claude-code'
  const url = claude ? origin : `${origin}/v1`
  const urlName = claude ? 'ANTHROPIC_BASE_URL' : 'OPENAI_BASE_URL'
  const keyName = claude ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'
  const command =
    input.os === 'windows'
      ? `setx ${urlName} "${url}" && setx ${keyName} "${input.apiKey}"`
      : `export ${urlName}="${url}"\nexport ${keyName}="${input.apiKey}"`
  return {
    steps: ['Set the environment variables, then start the client.'],
    command,
  }
}
