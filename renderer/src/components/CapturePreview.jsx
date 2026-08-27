// renderer/src/components/CapturePreview.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import { CustomSelect } from "./CustomSelect";

const ASPECT_STORAGE_KEY = "picoCaptureAspect";

const ASPECT_OPTIONS = [
    { value: "16/9", label: "16:9" },
    { value: "16/10", label: "16:10" },
    { value: "4/3", label: "4:3" },
    { value: "21/9", label: "21:9" },
];

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
        async function loadDevices() {
            try {
                const list = await navigator.mediaDevices.enumerateDevices();
                const videos = list.filter((d) => d.kind === "videoinput");
                setDevices(videos);

                if (videos.length > 0) {
                    const preferred = videos.find((d) =>
                        /capture|hdmi|game|video/gi.test(d.label || "")
                    );
                    setDeviceId((preferred || videos[0]).deviceId);
                }
            } catch (e) {
                console.error(e);
                setError(t("capture.deviceError"));
            }
        }
        loadDevices();
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
                currentStreamRef.current.getTracks().forEach((t) => t.stop());
                currentStreamRef.current = null;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: { exact: deviceId } },
                    audio: false,
                });

                // If a switch to another device (or an unmount) happened while we were acquiring,
                // this stream is no longer needed and is discarded immediately
                if (generation !== streamGenerationRef.current) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }

                currentStreamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play().catch(() => { });
                }
            } catch (e) {
                console.error(e);
                setError(t("capture.streamError"));
            }
        }

        startStream();

        // Stop on unmount (bump the generation to invalidate any acquisition in flight)
        return () => {
            streamGenerationRef.current += 1;
            if (currentStreamRef.current) {
                currentStreamRef.current.getTracks().forEach((t) => t.stop());
                currentStreamRef.current = null;
            }
        };
    }, [deviceId]);

    return (
        <div>
            <div className="capture-header">
                <CustomSelect
                    dense
                    className="capture-select"
                    value={deviceId}
                    onChange={(next) => setDeviceId(next)}
                    placeholder={t("capture.selectDevice")}
                    options={devices.map((d) => ({
                        value: d.deviceId,
                        label: d.label || `Camera ${d.deviceId.slice(0, 8)}`,
                    }))}
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
