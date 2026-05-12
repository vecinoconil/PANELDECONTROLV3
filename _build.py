import subprocess, sys
result = subprocess.run(
    ['npm', 'run', 'build'],
    cwd=r'C:\PANELDECONTROLV3\frontend',
    capture_output=True,
    text=True,
    shell=True
)
print("STDOUT:", result.stdout[-3000:] if len(result.stdout) > 3000 else result.stdout)
print("STDERR:", result.stderr[-2000:] if len(result.stderr) > 2000 else result.stderr)
print("Return code:", result.returncode)
