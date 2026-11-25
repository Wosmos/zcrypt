//! The app's secrets in the OS keychain.
//!
//! On macOS each keychain item has its own access list, bound to the app's code
//! signature. The app is ad-hoc signed, so every build is a stranger to the
//! keychain and each item asked for the login password separately. There all
//! secrets share one item, read once per launch: a new build asks at most once,
//! and "Always Allow" ends it. Elsewhere each secret keeps its own item.

const SERVICE: &str = "app.zcrypt.desktop";

#[cfg(any(target_os = "macos", test))]
mod shared {
    use std::collections::BTreeMap;
    use std::sync::Mutex;

    type Map = BTreeMap<String, String>;

    pub trait Item {
        fn read(&self) -> keyring::Result<Option<String>>;
        fn write(&self, value: Option<&str>) -> keyring::Result<()>;
    }

    pub struct Secrets<I> {
        item: I,
        cache: Mutex<Option<Map>>,
    }

    impl<I: Item> Secrets<I> {
        pub const fn new(item: I) -> Self {
            Self {
                item,
                cache: Mutex::new(None),
            }
        }

        fn with<T>(
            &self,
            f: impl FnOnce(&I, &mut Map) -> keyring::Result<T>,
        ) -> keyring::Result<T> {
            let mut guard = self.cache.lock().unwrap_or_else(|p| p.into_inner());
            let map = match guard.as_mut() {
                Some(map) => map,
                None => {
                    let loaded = match self.item.read()? {
                        Some(json) => serde_json::from_str(&json)
                            .map_err(|e| keyring::Error::PlatformFailure(Box::new(e)))?,
                        None => Map::new(),
                    };
                    guard.insert(loaded)
                }
            };
            f(&self.item, map)
        }

        pub fn get(&self, key: &str) -> keyring::Result<Option<String>> {
            self.with(|_, map| Ok(map.get(key).cloned()))
        }

        pub fn set(&self, key: &str, value: &str) -> keyring::Result<()> {
            self.with(|item, map| {
                if map.get(key).is_some_and(|v| v == value) {
                    return Ok(());
                }
                let previous = map.insert(key.to_string(), value.to_string());
                commit(item, map, key, previous)
            })
        }

        pub fn delete(&self, key: &str) -> keyring::Result<()> {
            self.with(|item, map| match map.remove(key) {
                Some(previous) => commit(item, map, key, Some(previous)),
                None => Ok(()),
            })
        }
    }

    fn commit(
        item: &impl Item,
        map: &mut Map,
        key: &str,
        previous: Option<String>,
    ) -> keyring::Result<()> {
        let written = if map.is_empty() {
            item.write(None)
        } else {
            serde_json::to_string(map)
                .map_err(|e| keyring::Error::PlatformFailure(Box::new(e)))
                .and_then(|json| item.write(Some(&json)))
        };
        if written.is_err() {
            match previous {
                Some(v) => map.insert(key.to_string(), v),
                None => map.remove(key),
            };
        }
        written
    }
}

#[cfg(target_os = "macos")]
mod backend {
    use super::SERVICE;
    use super::shared::{Item, Secrets};

    const ITEM: &str = "secrets.v1";

    pub struct Keychain;

    impl Item for Keychain {
        fn read(&self) -> keyring::Result<Option<String>> {
            match keyring::Entry::new(SERVICE, ITEM)?.get_password() {
                Ok(json) => Ok(Some(json)),
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(e) => Err(e),
            }
        }

        fn write(&self, value: Option<&str>) -> keyring::Result<()> {
            let entry = keyring::Entry::new(SERVICE, ITEM)?;
            match value {
                Some(json) => entry.set_password(json),
                None => match entry.delete_credential() {
                    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                    Err(e) => Err(e),
                },
            }
        }
    }

    static SECRETS: Secrets<Keychain> = Secrets::new(Keychain);

    pub fn get(key: &str) -> keyring::Result<Option<String>> {
        SECRETS.get(key)
    }

    pub fn set(key: &str, value: &str) -> keyring::Result<()> {
        SECRETS.set(key, value)
    }

    pub fn delete(key: &str) -> keyring::Result<()> {
        SECRETS.delete(key)
    }
}

#[cfg(not(target_os = "macos"))]
mod backend {
    use super::SERVICE;

    pub fn get(key: &str) -> keyring::Result<Option<String>> {
        match keyring::Entry::new(SERVICE, key)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn set(key: &str, value: &str) -> keyring::Result<()> {
        keyring::Entry::new(SERVICE, key)?.set_password(value)
    }

    pub fn delete(key: &str) -> keyring::Result<()> {
        match keyring::Entry::new(SERVICE, key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e),
        }
    }
}

pub use backend::{delete, get, set};

#[cfg(test)]
mod tests {
    use super::shared::{Item, Secrets};
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[derive(Default)]
    struct Fake {
        stored: Mutex<Option<String>>,
        reads: AtomicUsize,
        writes: AtomicUsize,
        fail_writes: Mutex<bool>,
    }

    impl Item for &Fake {
        fn read(&self) -> keyring::Result<Option<String>> {
            self.reads.fetch_add(1, Ordering::SeqCst);
            Ok(self.stored.lock().unwrap().clone())
        }

        fn write(&self, value: Option<&str>) -> keyring::Result<()> {
            if *self.fail_writes.lock().unwrap() {
                return Err(keyring::Error::NoStorageAccess(Box::new(std::fmt::Error)));
            }
            self.writes.fetch_add(1, Ordering::SeqCst);
            *self.stored.lock().unwrap() = value.map(str::to_string);
            Ok(())
        }
    }

    #[test]
    fn every_secret_comes_from_one_read() {
        let fake = Fake::default();
        let secrets = Secrets::new(&fake);
        secrets.set("auth.access", "a").unwrap();
        secrets.set("auth.refresh", "r").unwrap();
        secrets.set("vault.passphrase", "p").unwrap();
        assert_eq!(secrets.get("auth.refresh").unwrap().as_deref(), Some("r"));
        assert_eq!(secrets.get("platform.github.token").unwrap(), None);
        assert_eq!(fake.reads.load(Ordering::SeqCst), 1);

        let relaunched = Secrets::new(&fake);
        assert_eq!(
            relaunched.get("vault.passphrase").unwrap().as_deref(),
            Some("p")
        );
        assert_eq!(relaunched.get("auth.access").unwrap().as_deref(), Some("a"));
        assert_eq!(fake.reads.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn an_unchanged_value_is_not_written_again() {
        let fake = Fake::default();
        let secrets = Secrets::new(&fake);
        secrets.set("auth.access", "a").unwrap();
        secrets.set("auth.access", "a").unwrap();
        secrets.delete("missing").unwrap();
        assert_eq!(fake.writes.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn deleting_the_last_secret_removes_the_item() {
        let fake = Fake::default();
        let secrets = Secrets::new(&fake);
        secrets.set("auth.access", "a").unwrap();
        secrets.delete("auth.access").unwrap();
        assert_eq!(*fake.stored.lock().unwrap(), None);
    }

    #[test]
    fn a_failed_write_leaves_the_cache_matching_the_keychain() {
        let fake = Fake::default();
        let secrets = Secrets::new(&fake);
        secrets.set("auth.access", "old").unwrap();
        *fake.fail_writes.lock().unwrap() = true;
        assert!(secrets.set("auth.access", "new").is_err());
        assert!(secrets.set("vault.passphrase", "p").is_err());
        assert!(secrets.delete("auth.access").is_err());
        assert_eq!(secrets.get("auth.access").unwrap().as_deref(), Some("old"));
        assert_eq!(secrets.get("vault.passphrase").unwrap(), None);
    }

    #[test]
    fn a_denied_read_is_retried_rather_than_treated_as_empty() {
        struct Denied(AtomicUsize);
        impl Item for &Denied {
            fn read(&self) -> keyring::Result<Option<String>> {
                self.0.fetch_add(1, Ordering::SeqCst);
                Err(keyring::Error::NoStorageAccess(Box::new(std::fmt::Error)))
            }
            fn write(&self, _: Option<&str>) -> keyring::Result<()> {
                panic!("must not overwrite secrets it could not read")
            }
        }
        let denied = Denied(AtomicUsize::new(0));
        let secrets = Secrets::new(&denied);
        assert!(secrets.get("auth.access").is_err());
        assert!(secrets.set("auth.access", "a").is_err());
        assert_eq!(denied.0.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn a_corrupt_item_is_neither_cached_as_empty_nor_overwritten() {
        let fake = Fake::default();
        *fake.stored.lock().unwrap() = Some("{not json".to_string());
        let secrets = Secrets::new(&fake);
        assert!(secrets.get("auth.access").is_err());
        assert!(secrets.set("auth.access", "a").is_err());
        assert_eq!(fake.writes.load(Ordering::SeqCst), 0);
        assert_eq!(fake.stored.lock().unwrap().as_deref(), Some("{not json"));
    }
}
