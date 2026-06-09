# Changelog

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
