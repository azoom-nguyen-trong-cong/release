const fs = require('fs');
const {execSync} = require('child_process');
const readline = require('readline');

function getNextVersion(currentVersion: string): string {
    let [major, minor, patch] = currentVersion.split('.').map(Number);
    if (patch === 9) {
        patch = 0;
        minor += 1;
    } else {
        patch += 1;
    }

    if (minor === 10) {
        minor = 0;
        major += 1;
    }

    return `${major}.${minor}.${patch}`;
}

const successMessage = (message: string) => {
    console.log(`\x1b[32m${message}\x1b[0m`);
}
const errorMessage = (message: any) => {
    console.log(`\x1b[31m${message}\x1b[0m`);
}

function getRepoInfo() {
    try {
        const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
        const url = execSync('git remote get-url origin').toString().trim();
        const repoName = url?.split(/[:\/]/).slice(-2).join('/').replace('.git', ''); // Remove '.git' if present
        const repoUrl = `https://github.com/${repoName}`
        return {branch, repoUrl};
    } catch (error) {
        console.error('Error fetching repository info:', error);
        process.exit(1);
    }
}

function getCompareUrl(baseBranch: string = 'main') {
    const {repoUrl, branch} = getRepoInfo()
    return `${repoUrl}/compare/${baseBranch}...${branch}`;
}

function updateVersionInPackageJson(newVersion: string) {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    packageJson.version = newVersion;
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2) + '\n');
    return newVersion;
}

function executeCommand(command: string) {
    try {
        const output = execSync(command, {stdio: 'inherit'});
        successMessage(`==done==: ${command}\n`);
        return output?.toString();
    } catch (err) {
        const regexTagExists = /Command failed: git tag v\d+.\d+.\d+/;
        errorMessage(err);
        errorMessage(`Error executing command: ${command}`);
        if (!!err && regexTagExists.test(err.toString())) {
            errorMessage('Please delete old tag before creating a new tag: git tag -d vx.y.z ');
        }
        process.exit(1);
    }
}

function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true
    });

    return new Promise((resolve) => {
        rl.question(`\x1b[32m${query}\x1b[0m`, (answer: string) => {
            rl.close();
            successMessage(`Your answer: ${answer}`);
            resolve(answer);
        });
    });
}

const release = async () => {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const currentVersion = packageJson.version;
    const newVersion = getNextVersion(currentVersion);

    successMessage(`Current version: ${currentVersion}`);
    successMessage(`New version: ${newVersion}\n`);
    updateVersionInPackageJson(newVersion);

    executeCommand('git add --all');
    executeCommand(`git commit -m ":bookmark: v${newVersion}" -n`);
    executeCommand('git push');

    const compareUrl = getCompareUrl();
    successMessage('\nOpening GitHub PR for merge...');
    executeCommand(`open ${compareUrl}`);

    const answer = await askQuestion('\nHave you actually merged the develop branch into main? (y/n): ');
    if (answer.toLowerCase() === 'y') {
        executeCommand('git checkout main');
        executeCommand('git pull --rebase');
    } else {
        errorMessage('Merge canceled.');
        process.exit(0);
    }

    const pushTagAnswer = await askQuestion('\nDo you want to push the tag deploy automatically or manually? (a/m): ');
    if (pushTagAnswer.toLowerCase() === 'a') {
        executeCommand(`git tag v${newVersion}`);
        executeCommand(`git push origin v${newVersion}`);
    } else {
        successMessage(`=============================================`);
        successMessage(`==== Please push tag manually to deploy: ====`);
        successMessage(`==== 1. git tag v${newVersion}           ====`);
        successMessage(`==== 2. git push origin v${newVersion}   ====`);
        successMessage(`=============================================\n`);

        process.exit(0);
    }
}

const confirmBranchRelease = async () => {
    const branch = await askQuestion('Checkout branch want to release, default is "develop": ') || 'develop';
    executeCommand(`git fetch`);
    executeCommand(`git checkout ${branch}`);
    executeCommand(`git pull --rebase`);
}
const updateDependencies = async () => {
    const dependencies = await askQuestion('Do you need to update dependencies?, (ex: @azoom/tomemiru-db@1.4.0 uuid ...). Leave blank if not: ');
    if (dependencies) executeCommand(`yarn add ${dependencies}`);
}

async function main() {
    try {
        await confirmBranchRelease()
        await updateDependencies()
        await release()

        successMessage(`All done!`);
    } catch (err) {
        errorMessage(err);
        errorMessage(`Release failed!`);
        process.exit(1);
    }
}

main();
