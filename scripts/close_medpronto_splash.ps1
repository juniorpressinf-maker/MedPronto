# Fecha a janela de splash "MedPronto — Iniciando" (nao mexe na janela de login)
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class MedProntoSplashCloser {
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    private const uint WM_CLOSE = 0x0010;

    public static int CloseSplashWindows() {
        var closed = 0;
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;
            var sb = new StringBuilder(512);
            GetWindowText(hWnd, sb, 512);
            var title = sb.ToString();
            if (title.IndexOf("MedPronto", StringComparison.OrdinalIgnoreCase) >= 0 &&
                title.IndexOf("Iniciando", StringComparison.OrdinalIgnoreCase) >= 0) {
                PostMessage(hWnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                closed++;
            }
            return true;
        }, IntPtr.Zero);
        return closed;
    }
}
"@

Start-Sleep -Milliseconds 600
[MedProntoSplashCloser]::CloseSplashWindows() | Out-Null
