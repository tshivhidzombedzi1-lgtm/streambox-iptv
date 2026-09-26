import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// CI numbers each build (GITHUB_RUN_NUMBER), so a newer APK always installs over an older one.
val buildNumber = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1

// Release signing comes from environment variables that CI fills in from GitHub
// Secrets. The keystore itself is never in the repo (it is public).
val keystorePath: String? = System.getenv("ANDROID_KEYSTORE_PATH")
val canSign = !keystorePath.isNullOrBlank() && file(keystorePath).exists()

// `-Pplay=true` builds for the Play Store, where Premium must not be bought through
// the browser from inside the app (Play billing rules). Sideloaded builds may.
val playBuild = (findProperty("play") as String?)?.toBoolean() ?: false

android {
    namespace = "online.yokotv.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "online.yokotv.app"
        minSdk = 21
        targetSdk = 36
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"

        buildConfigField("String", "SITE_HOST", "\"yokotv.online\"")
        buildConfigField("String", "START_URL", "\"https://yokotv.online/\"")
        buildConfigField("boolean", "PLAY_BUILD", playBuild.toString())
    }

    signingConfigs {
        if (canSign) {
            create("release") {
                storeFile = file(keystorePath!!)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (canSign) signingConfig = signingConfigs.getByName("release")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        // Lint still runs and writes its report; it just doesn't block the APK.
        abortOnError = false
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-ktx:1.11.0")
    implementation("androidx.core:core-splashscreen:1.2.0")
    implementation("androidx.browser:browser:1.9.0")
}
