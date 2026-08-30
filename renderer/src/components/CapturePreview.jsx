// renderer/src/components/CapturePreview.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import { CustomSelect } from "./CustomSelect";

const ASPECT_STORAGE_KEY = "picoCaptureAspect";

// Sentinel used when the platform hands back a videoinput with no deviceId
// (Windows does this until a capture has actually been granted). It means
// "let the OS pick", i.e. plain `video: true`.
const DEFAULT_DEVICE = "__default__";

const ASPECT_OPTIONS = [
    { value: "16/9", label: "16:9" },
    { value: "16/10", label: "16:10" },
    { value: "4/3", label: "4:3" },
    { value: "21/9", label: "21:9" },
];

// Capture cards often expose only HD modes, and Chromium's default request is 640x480 —
// on Windows that combination can fail outright instead of negotiating. Asking for 1080p
// as an *ideal* steers it at a mode the device really has without ever over-constraining.
const IDEAL_SIZE = { width: { ideal: 1920 }, height: { ideal: 1080 } };

// Ordered getUserMedia constraints: the strictest first, each fallback dropping one
// requirement. `soleDevice` allows the last resort of "whatever camera exists", which is
// only safe when there is nothing else to grab by mistake.
function constraintChain(id, soleDevice) {
    if (id === DEFAULT_DEVICE) {
        return [
            { video: { ...IDEAL_SIZE }, audio: false },
            { video: true, audio: false },
        ];
    }
    const chain = [
        { video: { deviceId: { exact: id }, ...IDEAL_SIZE }, audio: false },
        { video: { deviceId: { exact: id } }, audio: false },
        { video: { deviceId: id }, audio: false },
    ];
    if (soleDevice) chain.push({ video: true, audio: false });
    return chain;
}

export function CapturePreview() {
    const { t } = useTranslation();
    const videoRef = React.useRef(null);

    const [devices, setDevices] = React.useState([]);
    const [deviceId, setDeviceId] = React.useState("");
    const [error, setError] = React.useState("");

    // Display aspect ratio (persisted in localStorage)
    const [aspect, setAspect] = React.useState(() => {
        try {
            const saved = window.localStorage?.getItem(ASPECT_STORAGE_KEY);
            return ASPECT_OPTIONS.some((o) => o.value === saved) ? saved : "16/9";
        } catch {
            return "16/9";
        }
    });

    const handleAspectChange = (next) => {
        setAspect(next);
        try {
            window.localStorage?.setItem(ASPECT_STORAGE_KEY, next);
        } catch (e) {
            console.warn("Failed to save aspect ratio", e);
        }
    };

    const currentStreamRef = React.useRef(null);
    // A generation token used to discard the result of a stale getUserMedia when devices are switched in quick succession
    const streamGenerationRef = React.useRef(0);

    // Enumerate devices
    React.useEffect(() => {
        let cancelled = false;

        async function loadDevices() {
            try {
                // Until a capture has been granted once, enumerateDevices reports videoinputs
                // with an empty label *and* an empty deviceId, which then makes every
                // `deviceId: { exact: ... }` request fail. Priming with a throwaway stream
                // settles the permission so the real list comes back usable. A failure here
                // is not fatal: the enumeration below still runs.
                let primed = null;
                try {
                    primed = await navigator.mediaDevices.getUserMedia({ video: true });
                } catch (e) {
                    console.warn("Camera permission priming failed", e?.name || e);
                } finally {
                    primed?.getTracks().forEach((tr) => tr.stop());
                }
                if (cancelled) return;

                const list = await navigator.mediaDevices.enumerateDevices();
                if (cancelled) return;

                const videos = list.filter((d) => d.kind === "videoinput");
                // Entries without a deviceId cannot be selected by constraint; they are
                // collapsed into the single "let the OS pick" entry instead.
                const named = videos.filter((d) => d.deviceId);
                const usable =
                    named.length > 0
                        ? named.map((d) => ({
                              value: d.deviceId,
                              label: d.label || `Camera ${d.deviceId.slice(0, 8)}`,
                          }))
                        : videos.length > 0
                          ? [{ value: DEFAULT_DEVICE, label: t("capture.defaultDevice") }]
                          : [];

                setDevices(usable);
                if (usable.length === 0) {
                    setDeviceId("");
                    setError(t("capture.noDevice"));
                    return;
                }

                setDeviceId((prev) => {
                    if (prev && usable.some((d) => d.value === prev)) return prev;
                    const preferred = usable.find((d) =>
                        /capture|hdmi|game|video/i.test(d.label || "")
                    );
                    return (preferred || usable[0]).value;
                });
            } catch (e) {
                console.error(e);
                if (!cancelled) setError(`${t("capture.deviceError")} (${e?.name || "Error"})`);
            }
        }

        loadDevices();

        // Capture cards are usually plugged in after the app is already open
        const onDeviceChange = () => loadDevices();
        navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
        return () => {
            cancelled = true;
            navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
        };
    }, []);

    // Re-establish the stream when the selected device changes
    React.useEffect(() => {
        async function startStream() {
            if (!deviceId) return;
            setError("");

            // Record the generation of this stream request so we can tell if it is still current when it resolves
            const generation = ++streamGenerationRef.current;

            // Stop the existing stream, if any
            if (currentStreamRef.current) {
                currentStreamRef.current.getTracks().forEach((tr) => tr.stop());
                currentStreamRef.current = null;
            }

            const chain = constraintChain(deviceId, devices.length <= 1);
            let stream = null;
            let lastError = null;

            for (const constraints of chain) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia(constraints);
                    break;
                } catch (e) {
                    lastError = e;
                    console.warn("getUserMedia failed", e?.name, constraints);
                    // A denied permission will not be fixed by loosening the constraints
                    if (e?.name === "NotAllowedError" || e?.name === "SecurityError") break;
                }
                if (generation !== streamGenerationRef.current) return;
            }

            if (!stream) {
                console.error(lastError);
                const name = lastError?.name || "Error";
                const key =
                    name === "NotReadableError" || name === "AbortError"
                        ? "capture.streamBusy"
                        : "capture.streamError";
                setError(`${t(key)} (${name})`);
                return;
            }

            // If a switch to another device (or an unmount) happened while we were acquiring,
            // this stream is no longer needed and is discarded immediately
            if (generation !== streamGenerationRef.current) {
                stream.getTracks().forEach((tr) => tr.stop());
                return;
            }

            currentStreamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play().catch((e) => {
                    console.warn("video.play failed", e?.name || e);
                });
            }
        }

        startStream();

        // Stop on unmount (bump the generation to invalidate any acquisition in flight)
        return () => {
            streamGenerationRef.current += 1;
            if (currentStreamRef.current) {
                currentStreamRef.current.getTracks().forEach((tr) => tr.stop());
                currentStreamRef.current = null;
            }
        };
    }, [deviceId, devices.length]);

    return (
        <div>
            <div className="capture-header">
                <CustomSelect
                    dense
                    className="capture-select"
                    value={deviceId}
                    onChange={(next) => setDeviceId(next)}
                    placeholder={t("capture.selectDevice")}
                    options={devices}
                    aria-label="Capture device"
                />
                <CustomSelect
                    dense
                    className="capture-select capture-aspect-select"
                    value={aspect}
                    onChange={handleAspectChange}
                    options={ASPECT_OPTIONS}
                    aria-label="Aspect ratio"
                />
            </div>
            <div className="capture-preview">

                <div className="capture-video-wrapper" style={{ aspectRatio: aspect }}>
                    <video
                        ref={videoRef}
                        className="capture-video"
                        muted
                        playsInline
                    />
                </div>

                {error && <div className="capture-error">{error}</div>}
            </div>
        </div>
    );
}
