param([string]$msg = 'fix: update')
Write-Host 'Redeploying...' -ForegroundColor Cyan
git add -A
git commit -m $msg
git push origin main
vercel --prod --yes
Write-Host 'Done.' -ForegroundColor Green
