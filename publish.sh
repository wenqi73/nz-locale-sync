echo '[Action] git push to another repo'
ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
site_name=nz-locale-sync-release
git config --global core.longpaths true
git config --global user.name "wenqi73"
git config --global user.email "1264578441@qq.com"
git clone https://github.com/wenqi73/${site_name}.git --depth=1
rsync -av --delete --exclude={'.DS_Store','.git*'} ${ROOT}/dist/ ./${site_name}/
cd ${site_name}
git add .
git commit -m "sync from azure ${BUILD_PULLREQUEST_SOURCEBRANCH}"
git push https://$(git-token)@github.com/wenqi73/${site_name}.git

echo '[Action] logging package files'
cd ${ROOT}/dist
ls
cat package.json
echo '[Action] adding token to npmrc'
echo '//registry.npmjs.org/:_authToken=$(npm-token)' > .npmrc

echo 'npm publish'
# npm publish
