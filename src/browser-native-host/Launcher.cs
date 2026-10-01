using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// Chrome owns this launcher. Its Job Object owns the bundled runtime, so an
// abrupt Chrome disconnect cannot leave an Electron helper process orphaned.
internal static class Launcher
{
    private const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

    private sealed class Configuration
    {
        public string runtimePath { get; set; }
        public string scriptPath { get; set; }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimits
    {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters
    {
        public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
        public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimits
    {
        public BasicLimits BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll")]
    private static extern bool SetInformationJobObject(IntPtr job, int informationClass, ref ExtendedLimits limits, uint length);
    [DllImport("kernel32.dll")]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    private static string Quote(string value)
    {
        var result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char character in value)
        {
            if (character == '\\') { slashes++; continue; }
            if (character == '"') result.Append('\\', slashes * 2 + 1).Append(character);
            else result.Append('\\', slashes).Append(character);
            slashes = 0;
        }
        return result.Append('\\', slashes * 2).Append('"').ToString();
    }

    private static void Pump(Stream input, Stream output)
    {
        var buffer = new byte[65536];
        int count;
        while ((count = input.Read(buffer, 0, buffer.Length)) > 0)
        {
            output.Write(buffer, 0, count);
            output.Flush();
        }
    }

    private static void ReportFailure()
    {
        try
        {
            byte[] body = Encoding.UTF8.GetBytes("{\"type\":\"host_status\",\"code\":\"HOST_ERROR\",\"error\":\"Native browser runtime is unavailable\"}");
            using (Stream output = Console.OpenStandardOutput())
            {
                byte[] prefix = BitConverter.GetBytes(body.Length);
                output.Write(prefix, 0, prefix.Length);
                output.Write(body, 0, body.Length);
                output.Flush();
            }
        }
        catch { }
    }

    [STAThread]
    private static int Main(string[] args)
    {
        Process child = null;
        IntPtr job = IntPtr.Zero;
        bool started = false;
        try
        {
            string directory = AppDomain.CurrentDomain.BaseDirectory;
            var config = new JavaScriptSerializer().Deserialize<Configuration>(File.ReadAllText(Path.Combine(directory, "launcher.json")));
            if (args.Length < 1 || config == null || !Path.IsPathRooted(config.runtimePath) || !Path.IsPathRooted(config.scriptPath) || !File.Exists(config.runtimePath) || !File.Exists(config.scriptPath)) throw new InvalidOperationException();
            job = CreateJobObject(IntPtr.Zero, null);
            var limits = new ExtendedLimits();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if (job == IntPtr.Zero || !SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits)))) throw new InvalidOperationException();
            var info = new ProcessStartInfo(config.runtimePath, Quote(config.scriptPath) + " " + Quote(args[0]));
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardInput = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "1";
            child = Process.Start(info);
            if (child == null || !AssignProcessToJobObject(job, child.Handle)) throw new InvalidOperationException();
            started = true;
            Process runtime = child;
            var inputThread = new Thread(delegate()
            {
                try { Pump(Console.OpenStandardInput(), runtime.StandardInput.BaseStream); }
                catch { }
                finally { try { runtime.StandardInput.Close(); } catch { } }
            });
            inputThread.IsBackground = true;
            inputThread.Start();
            var errorThread = new Thread(delegate()
            {
                try { Pump(runtime.StandardError.BaseStream, Console.OpenStandardError()); }
                catch { }
            });
            errorThread.IsBackground = true;
            errorThread.Start();
            var outputThread = new Thread(delegate()
            {
                try { Pump(runtime.StandardOutput.BaseStream, Console.OpenStandardOutput()); }
                catch { try { runtime.Kill(); } catch { } }
            });
            outputThread.IsBackground = true;
            outputThread.Start();
            child.WaitForExit();
            // Chrome can close stdin without draining stdout. Runtime exit must
            // still release this launcher even while the relay write is blocked.
            outputThread.Join(1000);
            errorThread.Join(1000);
            return child.ExitCode;
        }
        catch
        {
            if (child != null) { try { if (!child.HasExited) child.Kill(); } catch { } }
            // Never inject diagnostics into an already active stream.
            if (!started) ReportFailure();
            return 1;
        }
        finally
        {
            if (job != IntPtr.Zero) CloseHandle(job);
            if (child != null) child.Dispose();
        }
    }
}
