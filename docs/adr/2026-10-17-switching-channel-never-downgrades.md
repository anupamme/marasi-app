# Switching channel never installs an older build on its own

When a researcher moves from nightly to release, the app keeps the nightly it has and offers an update only once a release is newer than that nightly's date. Going back to the latest release now is a separate, explicit reinstall that warns that projects opened in the nightly may not open in it. Marasi only migrates project files forward, so a nightly can leave a project in a schema the older release does not know.

We considered installing the latest release as soon as the channel changes, which is what "switch to release" seems to mean but silently risks the researcher's projects, and asking at switch time, which puts a schema question to someone who just wanted to stop getting nightlies.
