# Screen Trainer - MyStream asks Windows about windows, and can move one.
# Run by mystream.js as: powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <this file> -Mode list
#                    or: ... -Mode move -Handle <number> -X <number> -Y <number>
# list   prints every visible top-level window: handle, program name, window class, title, style bits, place, size.
#        (MyStream needs it for windows that Windows leaves out of its "windows you can share" list, such as a
#        desktop pet's, and to know where a game's window is.) Nothing is changed.
# move   moves one window to X, Y without resizing it, raising it or giving it the keyboard, and prints where it is
#        afterwards. MyStream uses it to keep a game's own window off the desktop while the game is on the stage, and
#        to bring it back. Nothing else about the window is touched.
# Prints one line of JSON as its last line. Keep this file plain ASCII.
param([string]$Mode = 'list', [long]$Handle = 0, [int]$X = 0, [int]$Y = 0)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class StWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int v, int size);
  public static List<IntPtr> All() { List<IntPtr> l = new List<IntPtr>(); EnumWindows(delegate(IntPtr h, IntPtr p) { l.Add(h); return true; }, IntPtr.Zero); return l; }
}
"@

$names = @{}
function Info([IntPtr]$h) {
  $r = New-Object 'StWin+RECT'
  [void][StWin]::GetWindowRect($h, [ref]$r)
  $t = New-Object Text.StringBuilder 300; [void][StWin]::GetWindowText($h, $t, 300)
  $c = New-Object Text.StringBuilder 200; [void][StWin]::GetClassName($h, $c, 200)
  [uint32]$procId = 0; [void][StWin]::GetWindowThreadProcessId($h, [ref]$procId)
  if (-not $names.ContainsKey($procId)) { $n = ''; try { $n = (Get-Process -Id $procId).ProcessName } catch { }; $names[$procId] = $n }
  [int]$cl = 0; try { [void][StWin]::DwmGetWindowAttribute($h, 14, [ref]$cl, 4) } catch { }
  [ordered]@{ h = $h.ToInt64(); proc = $names[$procId]; cls = $c.ToString(); title = $t.ToString(); ex = [StWin]::GetWindowLongPtr($h, -20).ToInt64();
    x = $r.L; y = $r.T; w = $r.R - $r.L; hgt = $r.B - $r.T; owned = ([StWin]::GetWindow($h, 4) -ne [IntPtr]::Zero); cloaked = $cl; min = [StWin]::IsIconic($h) }
}

if ($Mode -eq 'move') {
  $h = [IntPtr]$Handle
  if (-not [StWin]::IsWindow($h)) { '{"ok":false,"error":"no such window"}'; exit 0 }
  # 0x15 = do not resize, do not change the stacking order, do not activate
  $done = [StWin]::SetWindowPos($h, [IntPtr]::Zero, $X, $Y, 0, 0, 0x15)
  $o = Info $h; $o.ok = [bool]$done
  ConvertTo-Json -Compress -InputObject $o
  exit 0
}

$list = New-Object Collections.ArrayList
foreach ($h in [StWin]::All()) {
  if (-not [StWin]::IsWindowVisible($h)) { continue }
  $i = Info $h
  if ($i.w -lt 40 -or $i.hgt -lt 40) { continue }
  [void]$list.Add($i)
}
ConvertTo-Json -Compress -InputObject @{ ok = $true; windows = @($list) }
