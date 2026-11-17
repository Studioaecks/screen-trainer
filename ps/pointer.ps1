# Screen Trainer - MyStream: where the game windows on the stage are, and how big the mouse pointer is (0.9.4).
# Run by mystream.js as: powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <this file> -Handles <h1,h2,...> -Parent <pid>
# Ten times a second it looks at the windows of the games that are on the MyStream stage (only the handles it was
# given) and at the shape of the mouse pointer, and prints, whenever that changes, one line of JSON:
#   {"w":[[handle, left, top, right, bottom], ...], "c":[hotspotX, hotspotY, width, height, shown]}
# in screen pixels. MyStream needs the places to take the Windows pointer out of each game's picture and to put the
# owner's own pointer on the stage where the mouse is. It only reads: nothing is changed, no title or content is read,
# not even where the pointer is (Screen Trainer asks Electron for that).
# It ends by itself when Screen Trainer is gone. Keep this file plain ASCII.
param([string]$Handles = '', [int]$Parent = 0)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @"
using System; using System.Text; using System.Runtime.InteropServices;
public static class StPointer {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct CURSORINFO { public int cbSize; public int flags; public IntPtr hCursor; public POINT pt; }
  [StructLayout(LayoutKind.Sequential)] public struct ICONINFO { public bool fIcon; public int xHotspot; public int yHotspot; public IntPtr hbmMask; public IntPtr hbmColor; }
  [StructLayout(LayoutKind.Sequential)] public struct BITMAP { public int bmType; public int bmWidth; public int bmHeight; public int bmWidthBytes; public short bmPlanes; public short bmBitsPixel; public IntPtr bmBits; }
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetCursorInfo(ref CURSORINFO c);
  [DllImport("user32.dll")] public static extern bool GetIconInfo(IntPtr h, out ICONINFO i);
  [DllImport("gdi32.dll")] public static extern int GetObject(IntPtr h, int n, out BITMAP b);
  [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr v);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT v, int size);
  // the part of the window that is drawn (a window capture shows this, without the invisible resizing border)
  static RECT Box(IntPtr h) { RECT r; if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) GetWindowRect(h, out r); return r; }
  public static void Aware() { try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (Exception) { } }
  static IntPtr lastCursor = IntPtr.Zero; static string lastShape = "[0,0,32,32,1]";
  public static string Shape() {
    CURSORINFO c = new CURSORINFO(); c.cbSize = Marshal.SizeOf(typeof(CURSORINFO));
    if (!GetCursorInfo(ref c)) return lastShape;
    int shown = (c.flags & 1) != 0 ? 1 : 0;
    if (c.hCursor != lastCursor) {
      lastCursor = c.hCursor;
      ICONINFO ii; int w = 32, hgt = 32, hx = 0, hy = 0;
      if (c.hCursor != IntPtr.Zero && GetIconInfo(c.hCursor, out ii)) {
        hx = ii.xHotspot; hy = ii.yHotspot;
        BITMAP b;
        if (ii.hbmColor != IntPtr.Zero && GetObject(ii.hbmColor, Marshal.SizeOf(typeof(BITMAP)), out b) != 0) { w = b.bmWidth; hgt = b.bmHeight; }
        else if (ii.hbmMask != IntPtr.Zero && GetObject(ii.hbmMask, Marshal.SizeOf(typeof(BITMAP)), out b) != 0) { w = b.bmWidth; hgt = b.bmHeight / 2; }      // black and white: the mask holds two pictures, one above the other
        if (ii.hbmColor != IntPtr.Zero) DeleteObject(ii.hbmColor);
        if (ii.hbmMask != IntPtr.Zero) DeleteObject(ii.hbmMask);
      }
      lastShape = "[" + hx + "," + hy + "," + w + "," + hgt + ",";
    }
    return lastShape + shown + "]";
  }
  public static string Places(long[] handles) {
    StringBuilder sb = new StringBuilder("["); bool first = true;
    foreach (long n in handles) {
      IntPtr h = new IntPtr(n);
      if (!IsWindow(h) || !IsWindowVisible(h) || IsIconic(h)) continue;
      RECT r = Box(h);
      if (!first) sb.Append(','); first = false;
      sb.Append('[').Append(n).Append(',').Append(r.L).Append(',').Append(r.T).Append(',').Append(r.R).Append(',').Append(r.B).Append(']');
    }
    return sb.Append(']').ToString();
  }
}
"@

[StPointer]::Aware()
$list = @()
foreach ($p in ($Handles -split ',')) { $v = 0L; if ([long]::TryParse($p.Trim(), [ref]$v) -and $v -gt 0) { $list += $v } }
$list = [long[]]@($list | Select-Object -First 16)
$last = ''; $tick = 0
while ($true) {
  $now = '{"w":' + [StPointer]::Places($list) + ',"c":' + [StPointer]::Shape() + '}'
  if ($now -ne $last) { [Console]::Out.WriteLine($now); [Console]::Out.Flush(); $last = $now }
  $tick++
  if ($Parent -gt 0 -and $tick % 20 -eq 0) { try { [void](Get-Process -Id $Parent) } catch { break } }
  Start-Sleep -Milliseconds 100
}
