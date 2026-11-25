# Ajustes da janela preta (cmd) usados pelos .bat de compilar/empacotar.
#   -Acao SemEdicaoRapida : desliga o "Modo de Edicao Rapida" desta janela
#                           (um clique do mouse nao pausa mais a compilacao).
#   -Acao LimparTeclas    : descarta teclas apertadas durante o processo, para a
#                           pergunta final / "pressione uma tecla" esperarem de verdade.
# Nunca falha: qualquer erro aqui e ignorado (o .bat segue normalmente).
param([string]$Acao = 'SemEdicaoRapida')

try {
    if ($Acao -eq 'LimparTeclas') {
        $Host.UI.RawUI.FlushInputBuffer()
    } else {
        Add-Type -Namespace MedPronto -Name JanelaConsole -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError = true)] public static extern System.IntPtr GetStdHandle(int n);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool GetConsoleMode(System.IntPtr h, out uint m);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool SetConsoleMode(System.IntPtr h, uint m);
'@
        $h = [MedPronto.JanelaConsole]::GetStdHandle(-10)   # entrada do console
        $m = [uint32]0
        if ([MedPronto.JanelaConsole]::GetConsoleMode($h, [ref]$m)) {
            # tira ENABLE_QUICK_EDIT_MODE (0x40) e liga ENABLE_EXTENDED_FLAGS (0x80)
            $novo = ($m -band (-bnot [uint32]0x40)) -bor [uint32]0x80
            [void][MedPronto.JanelaConsole]::SetConsoleMode($h, $novo)
        }
    }
} catch { }
exit 0
