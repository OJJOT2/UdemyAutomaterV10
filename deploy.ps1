# deploy.ps1
# Zips the project and pushes to GitHub

Write-Host "Zipping project..."
Compress-Archive -Path src, data, index.js, package.json, package-lock.json, .env.example, .gitignore -DestinationPath UdemyAutomaterV10.zip -Force

Write-Host "Committing to Git..."
git add .
git commit -m "Automated update"

Write-Host "Pushing to GitHub..."
git push origin main

Write-Host "Deployment script finished!"
