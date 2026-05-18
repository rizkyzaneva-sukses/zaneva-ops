# Project Workflow Preferences

## Auto Commit & Push (WAJIB)

Setiap kali menyelesaikan task yang melibatkan perubahan code:

1. **Verifikasi build** dulu (`npx tsc --noEmit` atau setara)
2. **Stage** semua file yang diubah/baru terkait task tersebut
3. **Commit** dengan pesan yang jelas (gunakan format conventional commits: `feat:`, `fix:`, `chore:`, dll)
4. **Push** langsung ke `master` (deployment via Easypanel terhubung ke branch ini)

User tidak ingin repot manual commit/push — selalu auto-deploy ke Easypanel via push ke master.

## Format Commit Message

```
<type>: <subject ringkas>

- Bullet point detail perubahan 1
- Bullet point detail perubahan 2
```

Types: `feat`, `fix`, `chore`, `refactor`, `perf`, `docs`, `style`, `test`

## Hal yang Dihindari

- Jangan tanya "mau saya commit?" — langsung commit aja
- Jangan push tanpa verifikasi build berhasil
- Jangan amend commit yang sudah di-push (selalu commit baru)

## Deployment

- Branch: `master`
- Platform: Easypanel (auto-deploy on push to master)
- User cukup tunggu deployment selesai di Easypanel UI
