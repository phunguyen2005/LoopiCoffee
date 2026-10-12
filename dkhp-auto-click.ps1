param(
    [ValidateRange(1, 3600)]
    [int]$IntervalSeconds = 2,

    [ValidateRange(1, 1440)]
    [int]$DurationMinutes = 30
)

$ErrorActionPreference = "Stop"

if (-not ("AutoClick.NativeMethods" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

namespace AutoClick
{
    public static class NativeMethods
    {
        [StructLayout(LayoutKind.Sequential)]
        public struct Point
        {
            public int X;
            public int Y;
        }

        [DllImport("user32.dll")]
        public static extern bool GetCursorPos(out Point point);

        [DllImport("user32.dll")]
        public static extern bool SetCursorPos(int x, int y);

        [DllImport("user32.dll")]
        public static extern void mouse_event(
            uint flags,
            uint dx,
            uint dy,
            uint data,
            UIntPtr extraInfo
        );

        [DllImport("user32.dll")]
        public static extern short GetAsyncKeyState(int virtualKey);

        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();
    }
}
"@
}

$leftButtonDown = 0x0002
$leftButtonUp = 0x0004
$escapeKey = 0x1B
$f8Key = 0x77

function Test-KeyDown {
    param([int]$VirtualKey)

    return (([AutoClick.NativeMethods]::GetAsyncKeyState($VirtualKey) -band 0x8000) -ne 0)
}

function Wait-KeyReleased {
    param([int]$VirtualKey)

    while (Test-KeyDown -VirtualKey $VirtualKey) {
        Start-Sleep -Milliseconds 30
    }
}

Write-Host ""
Write-Host "AUTO CLICK DKHP" -ForegroundColor Cyan
Write-Host "1. Đưa chuột lên nút Làm mới." -ForegroundColor White
Write-Host "2. Nhấn F8 để bắt đầu bấm mỗi $IntervalSeconds giây." -ForegroundColor White
Write-Host "3. Nhấn F8 lần nữa hoặc ESC để dừng." -ForegroundColor White
Write-Host "Script tự dừng sau $DurationMinutes phút." -ForegroundColor Yellow
Write-Host ""
Write-Host "Đang chờ bạn đặt chuột và nhấn F8..." -ForegroundColor Green

$cancelledBeforeStart = $false
while ($true) {
    if (Test-KeyDown -VirtualKey $escapeKey) {
        $cancelledBeforeStart = $true
        break
    }

    if (Test-KeyDown -VirtualKey $f8Key) {
        break
    }

    Start-Sleep -Milliseconds 30
}

if ($cancelledBeforeStart) {
    Write-Host "Đã hủy." -ForegroundColor Yellow
    exit 0
}

$targetPoint = New-Object AutoClick.NativeMethods+Point
if (-not [AutoClick.NativeMethods]::GetCursorPos([ref]$targetPoint)) {
    throw "Không thể đọc vị trí con trỏ chuột."
}

$targetWindow = [AutoClick.NativeMethods]::GetForegroundWindow()
if ($targetWindow -eq [IntPtr]::Zero) {
    throw "Không xác định được cửa sổ trang web."
}

Wait-KeyReleased -VirtualKey $f8Key

$startedAt = [DateTimeOffset]::Now
$endsAt = $startedAt.AddMinutes($DurationMinutes)
$nextClickAt = $startedAt
$clickCount = 0
$skippedCount = 0
$stoppedByUser = $false

[Console]::Beep(880, 120)
Write-Host ""
Write-Host "Đã bắt đầu tại X=$($targetPoint.X), Y=$($targetPoint.Y)." -ForegroundColor Green
Write-Host "Có thể để chuột ở vị trí khác; script sẽ trả chuột lại sau mỗi lần bấm." -ForegroundColor DarkGray

while ([DateTimeOffset]::Now -lt $endsAt) {
    if ((Test-KeyDown -VirtualKey $escapeKey) -or (Test-KeyDown -VirtualKey $f8Key)) {
        $stoppedByUser = $true
        break
    }

    $now = [DateTimeOffset]::Now
    if ($now -ge $nextClickAt) {
        $activeWindow = [AutoClick.NativeMethods]::GetForegroundWindow()

        if ($activeWindow -eq $targetWindow) {
            $originalPoint = New-Object AutoClick.NativeMethods+Point
            [void][AutoClick.NativeMethods]::GetCursorPos([ref]$originalPoint)

            [void][AutoClick.NativeMethods]::SetCursorPos($targetPoint.X, $targetPoint.Y)
            [AutoClick.NativeMethods]::mouse_event(
                $leftButtonDown,
                0,
                0,
                0,
                [UIntPtr]::Zero
            )
            [AutoClick.NativeMethods]::mouse_event(
                $leftButtonUp,
                0,
                0,
                0,
                [UIntPtr]::Zero
            )
            [void][AutoClick.NativeMethods]::SetCursorPos($originalPoint.X, $originalPoint.Y)

            $clickCount++
            Write-Host ("[{0}] Đã bấm lần {1}" -f (Get-Date -Format "HH:mm:ss"), $clickCount)
        }
        else {
            $skippedCount++
        }

        $nextClickAt = $now.AddSeconds($IntervalSeconds)
    }

    Start-Sleep -Milliseconds 30
}

[Console]::Beep(660, 120)
[Console]::Beep(520, 160)

Write-Host ""
if ($stoppedByUser) {
    Write-Host "Đã dừng." -ForegroundColor Yellow
}
else {
    Write-Host "Đã chạy đủ $DurationMinutes phút." -ForegroundColor Green
}

Write-Host "Tổng số lần đã bấm: $clickCount. Lượt bỏ qua do đổi cửa sổ: $skippedCount."
Start-Sleep -Seconds 2

