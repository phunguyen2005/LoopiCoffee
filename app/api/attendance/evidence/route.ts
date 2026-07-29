export async function POST() {
  return Response.json(
    {
      error: "Ảnh chấm công phải được gửi cùng hành động để máy chủ đóng dấu và lưu nguyên tử.",
      code: "atomic_attendance_required",
    },
    { status: 410 },
  );
}
