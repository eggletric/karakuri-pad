# Supported controllers and input protocols

Two kinds of controller are supported as macro recording sources.
**Neither the transport nor the report format is compatible between them, so the two
implementations are entirely separate.**

| | Pro Controller (1st gen) | Pro Controller 2 |
|---|---|---|
| VID:PID | `057e:2009` | `057e:2069` |
| Transport | USB HID (`node-hid`) | **Bluetooth LE** (`@stoprocent/noble`) |
| How the OS sees it | A HID device | Does not show up as HID at all |
| Parser | `parseProControllerInput()` | `parseSwitch2Input()` |

## Why node-hid cannot see the Pro Controller 2

The Pro Controller 2 speaks a **custom GATT service** over Bluetooth LE and implements
no HID profile. It therefore never gets enumerated by `IOHIDManager` on macOS, and
`node-hid` cannot reach it even in principle (verified on real hardware; not even a USB
connection exposes a HID interface).

Talking to GATT directly over BLE is the only option, which is why noble is used.

## The Pro Controller 2 BLE protocol (measured)

### Finding the device

It is identified by the manufacturer data in its advertisement.

```
mfr = 53 05 01 00 03 7e 05 69 20 00 01 ...
      ^^^^^ company ID 0x0553
                     ^^^^^ VID 0x057e     ^^^^^ PID 0x2069
```

- The company ID is either `0x0553` (assigned by the Bluetooth SIG) or `0x057e`
  (Nintendo's USB VID)
- The payload contains PID `0x2069` little-endian, as `69 20`
- **`localName` is empty while the controller is in pairing mode.** Once paired it
  reads `Nintendo Switch 2 Pro Controller`. Relying on the name alone misses devices

### Receiving input

All it takes is subscribing to characteristic
`7492866c-ec3e-4619-8258-32755ffcc0f9`. **No handshake and no init command are
required** — data starts flowing the moment you subscribe.

- Report length: **112 bytes** (only the first 11 are used)
- Update rate: **roughly 32Hz**

### Report format

```
byte0    : sequence counter (monotonically increasing)
byte1    : always 0x20
byte2    : B=0x01  A=0x02  Y=0x04  X=0x08  R=0x10  ZR=0x20  PLUS=0x40  RSTICK=0x80
byte3    : DOWN=0x01 RIGHT=0x02 LEFT=0x04 UP=0x08 L=0x10 ZL=0x20 MINUS=0x40 LSTICK=0x80
byte4    : HOME=0x01  C=0x02  GR=0x04  GL=0x08  CAPTURE=0x10
byte5-10 : 4 axes (lx, ly, rx, ry) packed as 12 bits each
```

All 21 bits were confirmed one at a time on real hardware. No unknown bits were found.

**The bit layout is completely different from the 1st gen controller.** There, byte1 is
`Y=0x01 X=0x02 B=0x04 A=0x08`, the D-Pad is `down=0x01 up=0x02 right=0x04 left=0x08`,
and the stick offsets are shifted by one byte (1st gen `buf[4..9]` vs. Pro Controller 2
`buf[5..10]`).

### Measured stick values

```
lx: 330 - 3678      ly: 476 - 3497
rx: 498 - 3658      ry: 514 - 3715
```

Being 12 bits, the theoretical range is 0-4095 with 2048 at the centre, but **the actual
travel is only about 1450-1700 to either side.** Normalising against 2048 would top out
around 0.8 even at full tilt, so `SWITCH2_STICK_RANGE = 1700` is used for normalisation
and the result is clamped.

Raw values **grow towards up and right**. The firmware treats `LSTICK UP` as `y=0`, so
**only the Y axis is inverted** during the conversion to 0-255.

Idle drift measured at most +61 from the centre (about 5 on the 0-255 scale).
`STICK_RECORD_THRESHOLD = 12` absorbs it.

### About C / GL / GR

These are Switch 2 exclusive buttons. The firmware this app records for and passes
through to impersonates a **1st gen Switch controller**, so they cannot be sent.
Recording them would be pointless, so they are left out of `SWITCH2_BUTTON_MAP`.

The firmware's **dongle mode** (USB conversion for PC / Mac / Switch) does pass C/GL/GR through,
because it uses the full report path — but that is a separate path that does not involve
this app (see `procon2_dongle.h` on the firmware side).

## Connection behaviour (measured)

- **It does not sleep while connected.** 281 seconds of complete inactivity produced
  zero disconnects and zero dropped packets
- **It sleeps quickly while not connected.** Advertising stops and it disappears from
  scans
- Connecting to a sleeping controller can fail. **Putting it into pairing mode with the
  sync button makes the connection reliable**
- Once paired and advertising, a connection completes in **2-3 seconds**

Connecting for the first time is therefore **harder than reconnecting** after a drop.
The UI asks the user to press the sync button and keeps scanning until it gets a hit.

## About Bluetooth permissions

noble initialises CoreBluetooth as soon as it is `require()`d, which asks for the macOS
Bluetooth permission. Prompting people who never use the recording feature would be
rude, so it is lazily initialised: **`require` only happens when the recording modal is
opened** (`initNoble()` / `startBleController()`).

`electron-rebuild` is not needed under Electron. noble uses N-API
(`node-addon-api`), so a build targeting Node works as-is (confirmed on Electron 43).

## Passthrough latency design

Controller input is converted to Pico link commands (BLE or TCP) and sent directly from
the main process, but **stick events must not all be sent.**

Both links deliver all data in order, so a momentary stall leaves unsent stick values
piling up in the send buffer, and once it recovers the old input is replayed
oldest-first. New input queues up behind it the whole time, so the delay accumulates and
never catches up (observed as pronounced lag on real hardware).

The mitigation (in the passthrough implementation in `electron/main.js`):
- Only the **latest** stick value is kept, and it is sent on a ~30Hz timer (intermediate
  values are discarded)
- Sending is skipped while the unsent byte count exceeds a threshold (`writableLength`
  for TCP, the backlog of the write queue for BLE) — i.e. backpressure
- Buttons and the D-Pad are sent immediately for every event, since dropping one is not
  acceptable

The floor for steady-state latency is roughly 40-60ms: ~32Hz of BLE input (about 31ms)
plus the Pico link (BT / Wi-Fi) plus USB. That is a structural floor of the path and
cannot be reduced further.

## Credits

The Pro Controller 2 BLE protocol implementation is based on the analysis in
[mlstr0m/switch2bridge-macos](https://github.com/mlstr0m/switch2bridge-macos) (MIT),
verified against real hardware in this project.
