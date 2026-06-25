# Changelog


## [0.2.0]
### Added
* Initial IEC 60870-5-104 Master foundation (not yet functional)
* Initial Single Command node (not yet functional)
* Slave diagnostics and session statistics
* Implemented T2 timer handling in the slave
* Session summary on connection loss
* Internationalization (i18n) for slave connection status
* Unit tests for timers and APCI

### Changed
* Introduced a message queue and separated connection state handling to improve communication stability
* Updated input fields for Single Point, Double Point and Integrated Total nodes

### Fixed
* Improved handling of K-window related communication issues

### Migration Notes

No migration steps are required. The IEC104 Master and Single Command node are provided as initial scaffolding and are not yet operational.

## [0.1.1]

### Fixed

* Normalized node filenames to lowercase to prevent loading issues on case-sensitive file systems

### Migration Notes

#### Node Re-placement Required

Due to the filename changes, existing node instances may no longer be recognized by Node-RED. If affected, remove the old nodes from your flows and add the updated versions again.


## [0.1.0]

### Added

* Internationalization (i18n) support

  * English (`en-US`)
  * German (`de-DE`)

### Changed

* Information Object Addresses (IOA) can now be supplied dynamically via `msg.ioa`
* Quality descriptor defaults are now provided via `msg.qds` instead of `msg.quality`
* Renamed **Gateway** node to **IEC 60870-5 Slave** to better reflect its role as an IEC 104 controlled station

### Migration Notes

#### Quality Descriptor

The quality descriptor property has been renamed:

Before:

```javascript
msg.quality = {
    invalid: false,
    blocked: false,
    substituted: false,
    topical: true
}
```

After:

```javascript
msg.qds = {
    invalid: false,
    blocked: false,
    substituted: false,
    topical: true
}
```

#### Dynamic IOA

Information Object Addresses can now be overridden at runtime:

```javascript
msg.ioa = 100;
msg.payload = true;
```
