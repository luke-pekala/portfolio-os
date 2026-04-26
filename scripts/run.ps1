Write-Host 'Starting local dev server...' -ForegroundColor Cyan
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    Write-Host 'Installing Vercel CLI...' -ForegroundColor Yellow
    npm install -g vercel
}
vercel dev
