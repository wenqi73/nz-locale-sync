
cd ./package
echo '[Action] logging package files'
ls
echo '[Action] adding token to npmrc'
echo '//registry.npmjs.org/:_authToken=$(npm-token)' > .npmrc
npm publish
