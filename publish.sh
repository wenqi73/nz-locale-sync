echo '[Action] git push to another repo'
site_name=nz-locale-sync-release
repo=https://github.com/wenqi73/${site_name}.git
git config --global core.longpaths true
git config --global user.name "wenqi73"
git clone "${repo}" --depth=1
rsync -av --delete --exclude={'.DS_Store','.git*'} ./extract/package/ ./${site_name}/
cd nz-locale-sync-release
git add .
git commit -m "sync from azure devops"
git push ${repo}

echo '[Action] logging package files'
cd ../extract/package
ls
echo '[Action] adding token to npmrc'
echo '//registry.npmjs.org/:_authToken=$(npm-token)' > .npmrc

echo 'npm publish'
# npm publish
