$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
public static class OgleInputTotals {
  delegate IntPtr Hook(int code, IntPtr message, IntPtr data);
  static Hook keyboard = Keyboard, mouse = Mouse;
  static IntPtr kh, mh;
  static long keys, clicks;
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id, Hook callback, IntPtr module, uint thread);
  [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
  [DllImport("kernel32.dll", CharSet=CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
  static IntPtr Keyboard(int code, IntPtr message, IntPtr data) {
    // Deliberately never read the event structure or virtual-key code.
    if(code >= 0 && (message.ToInt64()==0x100 || message.ToInt64()==0x104)) Interlocked.Increment(ref keys);
    return CallNextHookEx(IntPtr.Zero, code, message, data);
  }
  static IntPtr Mouse(int code, IntPtr message, IntPtr data) {
    long m=message.ToInt64();
    if(code >= 0 && (m==0x201 || m==0x204 || m==0x207 || m==0x20B)) Interlocked.Increment(ref clicks);
    return CallNextHookEx(IntPtr.Zero, code, message, data);
  }
  public static void Run() {
    using(Process current=Process.GetCurrentProcess()) {
      IntPtr module=GetModuleHandle(current.MainModule.ModuleName);
      kh=SetWindowsHookEx(13, keyboard, module, 0); mh=SetWindowsHookEx(14, mouse, module, 0);
    }
    if(kh==IntPtr.Zero || mh==IntPtr.Zero) {if(kh!=IntPtr.Zero)UnhookWindowsHookEx(kh);if(mh!=IntPtr.Zero)UnhookWindowsHookEx(mh);throw new Exception("Input counters unavailable");}
    bool stopping=false;
    Thread reader=new Thread(()=>{try{while(Console.In.Read()!=-1){}}catch{} stopping=true;});reader.IsBackground=true;reader.Start();
    using(var timer=new System.Windows.Forms.Timer()) {
      timer.Interval=1000;
      timer.Tick+=(sender,args)=>{if(stopping){Application.ExitThread();return;}try{Console.WriteLine(Interlocked.Read(ref clicks)+","+Interlocked.Read(ref keys));Console.Out.Flush();}catch{Application.ExitThread();}};
      timer.Start();Console.WriteLine("0,0");Console.Out.Flush();
      try{Application.Run();}finally{UnhookWindowsHookEx(kh);UnhookWindowsHookEx(mh);}
    }
  }
}
"@ -ReferencedAssemblies System.Windows.Forms
[OgleInputTotals]::Run()
