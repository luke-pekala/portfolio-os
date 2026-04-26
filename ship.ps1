$ErrorActionPreference = 'Stop'
$ProjectName = 'portfolio-os'
$GitHubUser = 'luke-pekala'

Write-Host ''
Write-Host '=== Portfolio OS Ship Script ===' -ForegroundColor Cyan
Write-Host ''

foreach ($cmd in @('git','vercel','node','npm')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host ('ERROR: ' + $cmd + ' not found.') -ForegroundColor Red
        if ($cmd -eq 'vercel') { Write-Host '  Run: npm install -g vercel' -ForegroundColor Yellow }
        exit 1
    }
}
Write-Host 'Dependencies OK' -ForegroundColor DarkGray

$envVars = @{}
if (Test-Path '.env') {
    Get-Content '.env' | Where-Object { $_ -match '^[^#].+=.' } | ForEach-Object {
        $parts = $_ -split '=', 2
        $key = $parts[0].Trim()
        $val = $parts[1].Trim().Trim('"')
        $envVars[$key] = $val
        Write-Host ('  env: ' + $key) -ForegroundColor DarkGray
    }
    Write-Host ''
} else {
    Write-Host 'WARNING: No .env file found.' -ForegroundColor Yellow
    Write-Host '  Copy .env.example to .env and fill in your values.' -ForegroundColor Yellow
    Write-Host ''
}

$required = @('ADMIN_PASSWORD','NEXT_PUBLIC_URL')
$missing = $required | Where-Object { -not $envVars.ContainsKey($_) }
if ($missing.Count -gt 0) {
    Write-Host ('WARNING: Missing env vars: ' + ($missing -join ', ')) -ForegroundColor Yellow
    Write-Host ''
}

Write-Host 'Installing dependencies...' -ForegroundColor Yellow
npm install --silent
Write-Host 'Done.' -ForegroundColor DarkGray

if (-not (Test-Path '.git')) {
    Write-Host 'Initialising git repo...' -ForegroundColor Yellow
    git init
    git branch -M main
}

$remoteUrl = 'https://github.com/' + $GitHubUser + '/' + $ProjectName + '.git'
$existing = git remote get-url origin 2>$null
if ($existing) {
    git remote set-url origin $remoteUrl
} else {
    git remote add origin $remoteUrl
}
Write-Host ('Remote: ' + $remoteUrl) -ForegroundColor DarkGray

git add -A
$status = git status --porcelain
if ($status) {
    git commit -m 'feat: portfolio OS deploy'
    Write-Host 'Committed.' -ForegroundColor DarkGray
} else {
    Write-Host 'Nothing new to commit.' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host 'Pushing to GitHub...' -ForegroundColor Yellow
Write-Host '  Make sure repo exists: github.com/new  name: portfolio-os' -ForegroundColor DarkGray
git push -u origin main

$envKeys = @(
    'RESEND_API_KEY',
    'GOOGLE_SHEETS_ID',
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'ADMIN_PASSWORD',
    'NEXT_PUBLIC_URL',
    'OWNER_EMAIL'
)

Write-Host ''
Write-Host 'Pushing env vars to Vercel...' -ForegroundColor Yellow
foreach ($key in $envKeys) {
    if ($envVars.ContainsKey($key)) {
        $val = $envVars[$key]
        echo $val | vercel env add $key production --yes 2>$null
        Write-Host ('  ' + $key + ' added') -ForegroundColor DarkGray
    } else {
        Write-Host ('  ' + $key + ' skipped (not in .env)') -ForegroundColor DarkGray
    }
}

Write-Host ''
Write-Host 'Deploying to Vercel...' -ForegroundColor Yellow
$out = vercel --prod --yes 2>&1
Write-Host $out -ForegroundColor DarkGray

$url = ($out | Select-String 'https://\S+\.vercel\.app').Matches.Value | Select-Object -Last 1

Write-Host ''
Write-Host '===================================' -ForegroundColor Green
Write-Host 'DEPLOYED' -ForegroundColor Green
if ($url) { Write-Host $url -ForegroundColor Cyan }
Write-Host '===================================' -ForegroundColor Green
Write-Host ''
Write-Host 'POST-DEPLOY CHECKLIST:' -ForegroundColor Yellow
Write-Host ''
Write-Host '  Google Sheets: make sure Signups and Opens tabs exist' -ForegroundColor White
Write-Host '  Resend: verify your sending domain at resend.com/domains' -ForegroundColor White
Write-Host ''
Write-Host '  Admin dashboard:' -ForegroundColor White
if ($url) {
    Write-Host ('  ' + $url + '/admin') -ForegroundColor Cyan
} else {
    Write-Host '  yoursite.vercel.app/admin' -ForegroundColor DarkGray
}
Write-Host '  Password = ADMIN_PASSWORD from your .env' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  Local dev:  .\scripts\run.ps1' -ForegroundColor DarkGray
Write-Host '  Quick fix:  .\scripts\fix.ps1' -ForegroundColor DarkGray
Write-Host ''
