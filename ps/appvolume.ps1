# Screen Trainer - MyStream reads or sets how loud one game is in the Windows volume mixer (1.0).
# Run by mystream.js as: powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <this file> -Mode get -Handle <number>
#                    or: ... -Mode set -Handle <number> -Volume <0 to 100>
# The handle is the game's window. The program that owns that window is looked up, and every sound of a program with
# that name (on every speaker or headset that is switched on) is read or set, exactly as dragging its slider in the
# Windows volume mixer would. Nothing else is read or changed: no other program, no device, not the main volume.
# get    prints the program's name and its volume now (0 to 100), or -1 when it is not playing any sound yet.
# set    sets it and prints the same.
# probe  (for the self-check) only counts the programs that have a slider in the mixer right now. No names.
# Prints one line of JSON as its last line. Keep this file plain ASCII.
param([string]$Mode = 'get', [long]$Handle = 0, [int]$Volume = -1)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

Add-Type -TypeDefinition @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices;
namespace StMix {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
  }
  [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceCollection {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int Item(uint index, out IMMDevice device);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
  }
  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    [PreserveSig] int GetAudioSessionControl(IntPtr sessionGuid, int flags, out IntPtr control);
    [PreserveSig] int GetSimpleAudioVolume(IntPtr sessionGuid, int flags, out IntPtr volume);
    [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
  }
  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int GetSession(int index, out IAudioSessionControl2 session);
  }
  [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    [PreserveSig] int GetState(out int state);
    [PreserveSig] int GetDisplayName(out IntPtr name);
    [PreserveSig] int SetDisplayName(IntPtr name, IntPtr context);
    [PreserveSig] int GetIconPath(out IntPtr path);
    [PreserveSig] int SetIconPath(IntPtr path, IntPtr context);
    [PreserveSig] int GetGroupingParam(out Guid param);
    [PreserveSig] int SetGroupingParam(IntPtr param, IntPtr context);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr client);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr client);
    [PreserveSig] int GetSessionIdentifier(out IntPtr id);
    [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr id);
    [PreserveSig] int GetProcessId(out uint pid);
  }
  [ComImport, Guid("87CE5498-68D6-44E5-9215-6F48BB3B4D3B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    [PreserveSig] int SetMasterVolume(float level, ref Guid context);
    [PreserveSig] int GetMasterVolume(out float level);
  }
  public static class Mixer {
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    public static string NameOf(uint pid) { try { return System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch { return ""; } }
    public static uint OwnerOf(long handle) { IntPtr h = new IntPtr(handle); if (!IsWindow(h)) return 0; uint pid; GetWindowThreadProcessId(h, out pid); return pid; }
    // level < 0: only read. Returns the volume found (0 to 1), or -1 when the program has no sound right now.
    // every session on every active render device; no name: only count them
    public static float Apply(string name, float level, out int count) {
      count = 0; float found = -1; Guid none = Guid.Empty; Guid iid = typeof(IAudioSessionManager2).GUID;
      IMMDeviceEnumerator en = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
      IMMDeviceCollection devs; if (en.EnumAudioEndpoints(0, 1, out devs) != 0) return -1;      // speakers and headsets that are switched on
      uint n; devs.GetCount(out n);
      for (uint d = 0; d < n; d++) {
        IMMDevice dev; if (devs.Item(d, out dev) != 0) continue;
        object o; if (dev.Activate(ref iid, 23, IntPtr.Zero, out o) != 0) continue;
        IAudioSessionManager2 mgr = (IAudioSessionManager2)o;
        IAudioSessionEnumerator list; if (mgr.GetSessionEnumerator(out list) != 0) continue;
        int c; list.GetCount(out c);
        for (int i = 0; i < c; i++) {
          IAudioSessionControl2 s; if (list.GetSession(i, out s) != 0 || s == null) continue;
          uint pid; if (s.GetProcessId(out pid) != 0 || pid == 0) continue;
          if (string.IsNullOrEmpty(name)) { count++; continue; }
          if (!string.Equals(NameOf(pid), name, StringComparison.OrdinalIgnoreCase)) continue;
          ISimpleAudioVolume v = s as ISimpleAudioVolume; if (v == null) continue;
          if (level >= 0) v.SetMasterVolume(level, ref none);
          float now; if (v.GetMasterVolume(out now) == 0) { found = now; count++; }
        }
      }
      return found;
    }
  }
}
"@

if ($Mode -eq 'probe') { [int]$n = 0; [void][StMix.Mixer]::Apply($null, -1.0, [ref]$n); ConvertTo-Json -Compress -InputObject ([ordered]@{ ok = $true; sessions = $n }); exit 0 }
$owner = [StMix.Mixer]::OwnerOf($Handle)
if ($owner -eq 0) { '{"ok":false,"error":"no such window"}'; exit 0 }
$name = [StMix.Mixer]::NameOf($owner)
if (-not $name -or $name -match '^(explorer|dwm|csrss|winlogon|ScreenTrainer|audiodg|svchost)$') { '{"ok":false,"error":"not a game"}'; exit 0 }
$level = -1.0
if ($Mode -eq 'set') { if ($Volume -lt 0 -or $Volume -gt 100) { '{"ok":false,"error":"not a volume"}'; exit 0 }; $level = [float]($Volume / 100.0) }
[int]$count = 0
$v = [StMix.Mixer]::Apply($name, $level, [ref]$count)
$o = [ordered]@{ ok = $true; proc = $name; sessions = $count; volume = $(if ($v -lt 0) { -1 } else { [int][Math]::Round($v * 100) }) }
ConvertTo-Json -Compress -InputObject $o
