# Screen Trainer - what covers the field window (0.9.3).
# Run by main.js as: powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <this file> -Field <handle> -Skip <handle> -Parent <pid>
# Ten times a second it looks at the windows lying above the field window and prints, whenever it changes, one line
# of JSON: the parts of the field window they cover, as [[x, y, width, height], ...] in screen pixels. The overlay
# then hides the fountain, the buildings and the weather there; the Pokemon stay on top.
# It only reads where windows are: nothing is changed, no title or content is read.
# It ends by itself when the field window or Screen Trainer is gone. Keep this file plain ASCII.
param([long]$Field = 0, [long]$Skip = 0, [int]$Parent = 0)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @"
using System; using System.Text; using System.Runtime.InteropServices;
public static class StCover {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT v, int size);
  [DllImport("dwmapi.dll", EntryPoint = "DwmGetWindowAttribute")] public static extern int DwmGetInt(IntPtr h, int attr, out int v, int size);
  static RECT Box(IntPtr h) { RECT r; if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) GetWindowRect(h, out r); return r; }
  public static void Aware() { try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (Exception) { } }
  public static string Covers(IntPtr field, IntPtr skip) {
    RECT f = Box(field);
    StringBuilder sb = new StringBuilder("["); bool first = true; int n = 0;
    for (IntPtr h = GetWindow(field, 3); h != IntPtr.Zero && n < 600; h = GetWindow(h, 3), n++) {      // 3 = the window above
      if (h == skip || !IsWindowVisible(h) || IsIconic(h)) continue;
      int cl = 0; try { DwmGetInt(h, 14, out cl, 4); } catch (Exception) { } if (cl != 0) continue;     // cloaked: not on the screen
      long ex = GetWindowLongPtr(h, -20).ToInt64(); if ((ex & 0x20) != 0) continue;                    // clicks go through it: a see-through overlay
      RECT r = Box(h);
      int x0 = Math.Max(r.L, f.L), y0 = Math.Max(r.T, f.T), x1 = Math.Min(r.R, f.R), y1 = Math.Min(r.B, f.B);
      if (x1 - x0 < 2 || y1 - y0 < 2) continue;
      if (!first) sb.Append(','); first = false;
      sb.Append('[').Append(x0).Append(',').Append(y0).Append(',').Append(x1 - x0).Append(',').Append(y1 - y0).Append(']');
    }
    return sb.Append(']').ToString();
  }
}
"@

[StCover]::Aware()
$f = [IntPtr]$Field; $s = [IntPtr]$Skip; $last = ''; $tick = 0
while ([StCover]::IsWindow($f)) {
  $now = [StCover]::Covers($f, $s)
  if ($now -ne $last) { [Console]::Out.WriteLine($now); [Console]::Out.Flush(); $last = $now }
  $tick++
  if ($Parent -gt 0 -and $tick % 20 -eq 0) { try { [void](Get-Process -Id $Parent) } catch { break } }
  Start-Sleep -Milliseconds 100
}
