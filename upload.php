<?php
// Penerima foto di server pribadi. Taruh di public_html/upload.php, buat folder uploads/ (chmod 755).
$TOKEN = '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';   // samakan dengan CONFIG.SERVER_UPLOAD.TOKEN
header('Content-Type: application/json');
if (($_POST['token'] ?? '') !== $TOKEN) { http_response_code(403); echo '{"err":"token"}'; exit; }
if (!isset($_FILES['file']) || $_FILES['file']['error'] !== 0) { http_response_code(400); echo '{"err":"file"}'; exit; }
$folder = preg_replace('/[^a-z0-9_]/i', '', $_POST['folder'] ?? 'umum');
$dir = __DIR__ . '/uploads/' . $folder . '/' . date('Y-m');
if (!is_dir($dir)) mkdir($dir, 0755, true);
$name = date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.jpg';
if (!move_uploaded_file($_FILES['file']['tmp_name'], "$dir/$name")) { http_response_code(500); echo '{"err":"save"}'; exit; }
$base = (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['SCRIPT_NAME']);
echo json_encode(['url' => "$base/uploads/$folder/" . date('Y-m') . "/$name", 'name' => $name]);
