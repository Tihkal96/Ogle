$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class OgleFullscreen {
  [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder name, int length);
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  static bool Active(uint owner) {
    IntPtr window=GetForegroundWindow(); if(window==IntPtr.Zero)return false;
    uint pid; GetWindowThreadProcessId(window,out pid); if(pid==owner)return false;
    var name=new StringBuilder(128); GetClassName(window,name,name.Capacity);
    if(name.ToString()=="Progman" || name.ToString()=="WorkerW" || name.ToString()=="Shell_TrayWnd")return false;
    int state; if(SHQueryUserNotificationState(out state)==0 && (state==2 || state==3 || state==4))return true;
    Rect rect; var info=new MonitorInfo(); info.Size=Marshal.SizeOf(info);
    if(!GetWindowRect(window,out rect) || !GetMonitorInfo(MonitorFromWindow(window,2),ref info))return false;
    // Exact monitor coverage distinguishes borderless fullscreen from maximized
    // windows, whose decorated outer frame extends beyond monitor edges.
    return Math.Abs(rect.Left-info.Monitor.Left)<=1 && Math.Abs(rect.Top-info.Monitor.Top)<=1 && Math.Abs(rect.Right-info.Monitor.Right)<=1 && Math.Abs(rect.Bottom-info.Monitor.Bottom)<=1;
  }
  public static void Run(uint owner) {
    SetProcessDPIAware();
    int stopping=0; var reader=new Thread(()=>{try{while(Console.In.Read()!=-1){}}catch{} Interlocked.Exchange(ref stopping,1);}); reader.IsBackground=true;reader.Start();
    int previous=-1;
    while(Interlocked.CompareExchange(ref stopping,0,0)==0) {
      try { int active=Active(owner)?1:0; if(active!=previous){Console.WriteLine(active);Console.Out.Flush();previous=active;} } catch {return;}
      Thread.Sleep(250);
    }
  }
}
"@
[OgleFullscreen]::Run([uint32]$env:OGLE_OWNER_PID)
