# 🌿 Sơ Đồ Gia Phả – Fly.io Deployment Guide

## Yêu cầu

- Tài khoản [Fly.io](https://fly.io) (miễn phí)
- Cài đặt `flyctl`: https://fly.io/docs/hands-on/install-flyctl/

## Cấu trúc dự án

```
Webgiapha/
├── Dockerfile           ← Docker image definition
├── fly.toml             ← Fly.io configuration
├── pb_schema.json       ← Database schema (import once)
├── initial_members.json ← Dữ liệu mẫu ban đầu
└── pb_public/           ← Frontend (HTML, CSS, JS)
    ├── index.html
    ├── phado.html
    └── assets/
        ├── app.js
        └── style.css
```

## Các bước triển khai lên Fly.io

### Bước 1: Đăng nhập Fly.io
```powershell
flyctl auth login
```

### Bước 2: Khởi tạo ứng dụng (chỉ lần đầu)
```powershell
cd C:\Users\Admin\Downloads\Webgiapha
flyctl launch --no-deploy
```
- Khi được hỏi tên app, nhập: `gia-pha-portal`
- Khi được hỏi region, chọn: **Hong Kong (hkg)** – gần nhất VN
- Khi được hỏi "create a Postgresql database?", nhập **No**
- Khi được hỏi "deploy now?", nhập **No**

### Bước 3: Tạo Persistent Volume (lưu trữ database)
```powershell
flyctl volumes create pb_data --region hkg --size 1
```

### Bước 4: Deploy lên Fly.io
```powershell
flyctl deploy
```

### Bước 5: Mở ứng dụng trong trình duyệt
```powershell
flyctl open
```

## Thiết lập PocketBase Admin (lần đầu)

1. Truy cập: `https://gia-pha-portal.fly.dev/_/`
2. Tạo tài khoản Admin (email + password)
3. Vào **Settings → Import collections** → tải lên file `pb_schema.json`
4. Bắt đầu thêm thành viên!

## Cập nhật sau khi sửa code

```powershell
# Sync lại pb_public với source
xcopy /E /I /Y assets pb_public\assets
copy /Y phado.html pb_public\phado.html
copy /Y index.html pb_public\index.html

# Deploy lại
flyctl deploy
```

## Ghi chú

- Database được lưu tại persistent volume `/pb/pb_data` → **không bị mất khi restart**
- Media (ảnh/video) cũng được lưu trong volume này
- Nếu muốn backup: `flyctl ssh sftp get /pb/pb_data/data.db`
