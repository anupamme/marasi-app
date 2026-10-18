package main

// defaultInstaller installs marasi-app.exe by moving the running one aside;
// the next launch removes the copy moved aside.
func defaultInstaller() platformInstaller {
	return exeInstaller{}
}
