# Quy chuẩn commit và pull request

Cập nhật: 2026-10-13. Quy ước cho thay đổi mới; không yêu cầu viết lại lịch sử Git.

## Định dạng

```text
type(scope): short imperative summary
```

Summary bằng tiếng Anh, rõ hành vi thay đổi; khuyến nghị <=72 ký tự.
type: feat, fix, refactor, perf, test, docs, build, ci, chore, revert.
scope theo miền: scheduling, attendance, payroll, people, operations, ordering, auth, db, ui, docs, tooling.
Không bắt buộc scope khi thay đổi xuyên dự án. Dùng ! và BREAKING CHANGE footer chỉ khi thực sự phá tương thích.

Ví dụ:
```text
fix(scheduling): reject stale shift updates
test(attendance): cover retry after a lost response
docs: establish canonical project documentation
```

## Đơn vị commit

Một mục tiêu có thể review/rollback. Code, migration, regression test và docs cần cho cùng thay đổi có thể đi chung.
Không trộn cleanup ngoài phạm vi, formatting hàng loạt và thay nghiệp vụ.
Không sửa migration đã áp dụng; thêm migration mới khi cần. Không amend/rebase force-push lịch sử dùng chung nếu chưa được phép.
Không commit .env, .dev.vars, accounts.json, token, DB dump, ảnh công thật, generated test artifacts hoặc file người dùng không liên quan.

## Trước commit

1. Xem git status và diff; xác định thay đổi của mình/người dùng.
2. Stage file/hunk cụ thể; không dùng git add . theo thói quen.
3. Kiểm tra staged diff và git diff --check.
4. Chạy kiểm chứng theo [testing](testing.md); docs-only kiểm link/consistency.
5. Ghi trung thực test chưa chạy; không dùng commit message tuyên bố verified nếu chưa có evidence.

Chỉnh file không tự cấp quyền commit/push. Khi người dùng yêu cầu commit thì thực hiện trong phạm vi đó; push/merge/deploy cần căn cứ ủy quyền riêng.

## PR

Mô tả vấn đề và hành vi sau thay đổi; phạm vi, rule/decision ID, test đã chạy, migration/rollback nếu liên quan, rủi ro còn lại.
UI cần evidence trước/sau khi có. Không tạo PR hoặc gửi thông báo ngoài yêu cầu.
Không tự bịa issue/PR ID hay reviewer phê duyệt.

## Breaking change

Body phải nêu consumer bị ảnh hưởng, cách nâng cấp, rollout tương thích, migration/data safety và rollback.
Không dùng Conventional Commit làm lý do tự đổi version/release; quy trình release là quyết định riêng.
