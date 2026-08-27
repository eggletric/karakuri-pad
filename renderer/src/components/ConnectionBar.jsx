import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CustomSelect } from "./CustomSelect";
import { Modal } from "./Modal";
import { IoCheckmark, IoEllipse, IoEllipseOutline } from "react-icons/io5";
import { FaPen } from "react-icons/fa";

const DEFAULT_OPTION = "__default__";
const CREATE_OPTION = "__create__";

const PlusIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

// Legacy slots ({id, host, port}) carry no type, so they are treated as TCP.
// The legacy form also used the id as the display name, so fall back to the id when name is
// missing (splitting id and name apart lets slots share a name, like macro slots do).
function normalizeEntry(e) {
    if (!e) return null;
    return {
        id: e.id,
        name: e.name || e.id,
        type: e.type === "ble" ? "ble" : "tcp",
        host: e.host || "",
        port: e.port || 5000,
        btName: e.btName || "",
    };
}

// The mode is shown as a tag (badge) rather than as text
function entryLabel(e) {
    const isBle = e.type === "ble";
    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span className={`conn-type-tag ${isBle ? "conn-type-tag--bt" : "conn-type-tag--wifi"}`}>
                {isBle ? "BT" : "Wi-Fi"}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
        </span>
    );
}

export function ConnectionBar() {
    const { t } = useTranslation();
    const [entries, setEntries] = useState([]);
    const [selectedId, setSelectedId] = useState(DEFAULT_OPTION);
    const [status, setStatus] = useState("disconnected");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);   // null = creating a new slot
    const [slotToDelete, setSlotToDelete] = useState(null);

    // The create/edit modal. Bluetooth is the default (it is the easier one to set up)
    const [modalType, setModalType] = useState("ble");
    const [modalHost, setModalHost] = useState("192.168.11.190");
    const [modalPort, setModalPort] = useState("5000");
    const [modalBtName, setModalBtName] = useState("");
    const [modalName, setModalName] = useState("");

    // BLE scanning
    const [scanning, setScanning] = useState(false);
    const [scanResults, setScanResults] = useState(null);   // null = not run yet
    const [scanError, setScanError] = useState("");

    useEffect(() => {
        const raw = localStorage.getItem("picoConnections");
        if (raw) {
            try {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr) && arr.length > 0) {
                    setEntries(arr.map(normalizeEntry).filter(Boolean));
                }
            } catch (e) {
                // Ignore corrupted data and start from an empty array
                console.error(e);
            }
        }
    }, []);

    useEffect(() => {
        localStorage.setItem("picoConnections", JSON.stringify(entries));
    }, [entries]);

    // If the socket drops while status is only local state, the UI keeps saying "connected"
    // while nothing can actually be sent. Follow the notifications from the main process.
    useEffect(() => {
        const unsubscribe = window.pico?.onMessage?.((payload) => {
            if (!payload) return;
            if (payload.type === "closed") setStatus("disconnected");
            else if (payload.type === "connected") setStatus("connected");
            else if (payload.type === "error") setStatus("error");
        });
        return () => {
            if (typeof unsubscribe === "function") unsubscribe();
        };
    }, []);

    // After a reload, status is local state and falls back to disconnected, so fetch the real
    // link state from main and restore it. If the API is missing or fails, assume disconnected as before.
    const [linkStatus, setLinkStatus] = useState(null);
    const restoredSlotRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const link = await window.pico?.getLinkStatus?.();
                if (!cancelled && link) setLinkStatus(link);
            } catch (e) {
                console.error(e);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!linkStatus?.connected) return;
        setStatus("connected");
        if (restoredSlotRef.current) return;
        const match = entries.find((e) => {
            if (e.type !== linkStatus.type) return false;
            if (linkStatus.type === "ble") return e.btName === linkStatus.name;
            return e.host === linkStatus.host && Number(e.port) === Number(linkStatus.port);
        });
        if (match) {
            setSelectedId(match.id);
            restoredSlotRef.current = true;
        }
    }, [linkStatus, entries]);

    const openModal = () => {
        setEditingId(null);
        setModalType("ble");
        setModalHost("192.168.11.190");
        setModalPort("5000");
        setModalBtName("");
        setModalName("");
        setScanResults(null);
        setScanError("");
        setIsModalOpen(true);
    };

    const openEditModal = () => {
        const entry = entries.find((e) => e.id === selectedId);
        if (!entry) return;
        setEditingId(entry.id);
        setModalType(entry.type);
        setModalHost(entry.host || "192.168.11.190");
        setModalPort(String(entry.port || "5000"));
        setModalBtName(entry.btName || "");
        setModalName(entry.name);
        setScanResults(null);
        setScanError("");
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
    };

    const scanBle = async () => {
        if (!window.pico?.scanBleDevices) return;
        setScanning(true);
        setScanError("");
        try {
            const result = await window.pico.scanBleDevices({ durationMs: 4000 });
            setScanResults(result?.devices || []);
            if (result?.error) setScanError(result.error);
        } catch (e) {
            console.error(e);
            setScanResults([]);
            setScanError(e?.message || String(e));
        } finally {
            setScanning(false);
        }
    };

    // Start scanning automatically once Bluetooth is selected.
    // "Find it by scanning and pick it" is the main path; typing a name is only a fallback.
    useEffect(() => {
        if (isModalOpen && modalType === "ble" && scanResults === null && !scanning) {
            scanBle();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isModalOpen, modalType, scanResults, scanning]);

    const saveSlot = () => {
        // Editing keeps the existing id; new slots get a time-based unique id, like macro slots.
        // The display name lives in name, so slots can share a name
        const id = editingId ?? String(Date.now());
        let item;
        if (modalType === "ble") {
            const btName = modalBtName.trim();
            if (!btName) return alert(t("connection.deviceNameRequired"));
            const name = modalName.trim() || btName;
            item = { id, name, type: "ble", btName };
        } else {
            if (!modalHost.trim() || !modalPort.trim()) return alert(t("connection.hostPortRequired"));
            const portNum = Number(modalPort);
            if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
                return alert(t("connection.portInvalid"));
            }
            const name = modalName.trim() || `${modalHost}:${modalPort}`;
            item = { id, name, type: "tcp", host: modalHost, port: portNum };
        }

        const updated = entries
            .filter(e => e.id !== id)
            .concat(normalizeEntry(item));
        setEntries(updated);
        setSelectedId(id);
        closeModal();
    };

    const useSlot = id => {
        if (id === CREATE_OPTION) {
            openModal();
            setSelectedId(DEFAULT_OPTION);
            return;
        }
        setSelectedId(id);
    };

    // Whether cancel was pressed during a connection attempt. If it was, treat the rejection
    // as "not connected" rather than as an error
    const cancelRequestedRef = useRef(false);

    const connect = async () => {
        const selectedEntry = entries.find((e) => e.id === selectedId);
        if (!selectedEntry) return;
        cancelRequestedRef.current = false;
        setStatus("connecting");
        try {
            if (selectedEntry.type === "ble") {
                await window.pico?.connect?.({ type: "ble", name: selectedEntry.btName });
            } else {
                await window.pico?.connect?.({
                    type: "tcp",
                    host: selectedEntry.host,
                    port: Number(selectedEntry.port),
                });
            }
            setStatus("connected");
        } catch (e) {
            console.error(e);
            setStatus(cancelRequestedRef.current ? "disconnected" : "error");
        }
    };

    const cancelConnect = async () => {
        cancelRequestedRef.current = true;
        try {
            await window.pico?.cancelConnect?.();
        } catch (e) {
            console.error(e);
        }
        // The final state is settled by connect()'s own catch
    };

    const disconnect = async () => {
        const selectedEntry = entries.find((e) => e.id === selectedId);
        if (!selectedEntry) return;
        await window.pico?.disconnect?.();
        setStatus("disconnected");
    };

    const openDeleteModal = () => {
        const selectedEntry = entries.find((e) => e.id === selectedId);
        if (!selectedEntry) return;
        setSlotToDelete(selectedEntry);
    };

    const closeDeleteModal = () => setSlotToDelete(null);

    const deleteSlot = () => {
        if (!slotToDelete) return;
        setEntries((prev) => prev.filter((e) => e.id !== slotToDelete.id));
        setSelectedId(DEFAULT_OPTION);
        closeDeleteModal();
        setIsModalOpen(false);   // also close the edit modal if the deletion came from there
    };

    const statusDot = {
        connected: <IoEllipse />,
        connecting: <IoEllipse />,
        error: <IoEllipse />,
        disconnected: <IoEllipseOutline />,
    }[status];

    const statusLabel = {
        connected: t("connection.statusConnected"),
        connecting: t("connection.statusConnecting"),
        error: t("connection.statusError"),
        disconnected: t("connection.statusDisconnected"),
    }[status];

    const optionList = [
        { value: DEFAULT_OPTION, label: t("connection.selectPlaceholder") },
        ...entries.map((e) => ({ value: e.id, label: entryLabel(e) })),
        { type: "divider" },
        { value: CREATE_OPTION, label: t("connection.createNew"), icon: <PlusIcon /> },
    ];

    const selectedEntry = entries.find((e) => e.id === selectedId);
    const isDisabled = !selectedEntry;

    return (
        <div className="conn-bar-one">
            <div className="conn-status">
                <span style={{ marginTop: -3 }}>{statusLabel} </span>
                <span className={"status " + status}>{statusDot}</span>
            </div>
            <CustomSelect
                disabled={status === 'connected'}
                dense
                value={selectedId}
                onChange={(next) => useSlot(next)}
                placeholder={t("connection.selectPlaceholder")}
                options={optionList}
                aria-label="Connection slot"
                style={{ width: 'auto', minWidth: 400 }}
            />
            {(() => {
                if (status === 'connecting') {
                    // Connecting takes a while (BLE scans for up to 15 seconds), so let a
                    // second click cancel it
                    return (
                        <button className="btn btn--sm" onClick={cancelConnect}>
                            <span className="spinner" />{t("common.cancel")}
                        </button>
                    )
                }
                if (status === 'disconnected' || status === 'error') {
                    return (
                        <button className="btn btn--sm btn-primary" onClick={connect} disabled={isDisabled}>{t("common.connect")}</button>
                    )
                }
                return (
                    <button className="btn btn--sm btn-danger" onClick={disconnect} disabled={isDisabled}>{t("common.disconnect")}</button>
                )
            })()}

            <button
                className="btn btn--sm"
                onClick={openEditModal}
                disabled={isDisabled}
                aria-label={t("connection.editConnectionAria")}
            >
                <FaPen />
            </button>

            <Modal
                open={isModalOpen}
                onClose={closeModal}
                title={editingId ? t("connection.editTitle") : t("connection.createTitle")}
                footer={(
                    <>
                        {editingId && (
                            <button
                                className="btn btn--md btn--flat btn-danger"
                                style={{ marginRight: "auto" }}
                                onClick={openDeleteModal}
                            >
                                {t("common.delete")}
                            </button>
                        )}
                        <button className="btn btn--md" onClick={closeModal}>{t("common.cancel")}</button>
                        <button className="btn btn--md" onClick={saveSlot}>{t("common.save")}</button>
                    </>
                )}
            >
                <div className="cfg-field">
                    <label className="cfg-label">
                        {t("connection.modeLabel")}
                    </label>
                    <div style={{ display: "flex", gap: 18, padding: "4px 0" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                            <input
                                type="radio"
                                name="conn-slot-type"
                                checked={modalType === "ble"}
                                onChange={() => setModalType("ble")}
                            />
                            Bluetooth
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                            <input
                                type="radio"
                                name="conn-slot-type"
                                checked={modalType === "tcp"}
                                onChange={() => setModalType("tcp")}
                            />
                            Wi-Fi (TCP)
                        </label>
                    </div>
                </div>

                {modalType === "ble" ? (
                    <>
                        {/* Main path: find it by scanning and pick it. The name field shows the selection and doubles as a manual fallback */}
                        <div className="cfg-field">
                            <label className="cfg-label">
                                {t("connection.selectDeviceLabel")}
                            </label>
                            <div className="ble-device-list">
                                <div className="ble-device-list__header">
                                    <span>
                                        {scanning
                                            ? (<><span className="spinner" />{t("connection.scanningNearby")}</>)
                                            : t("connection.nearbyPicoHint")}
                                    </span>
                                    <button
                                        className="btn btn--sm btn--flat"
                                        onClick={scanBle}
                                        disabled={scanning}
                                    >
                                        {t("common.rescan")}
                                    </button>
                                </div>
                                <div className="ble-device-list__body">
                                    {(scanResults || []).map((d) => {
                                        const selected = modalBtName === d.name;
                                        return (
                                            <button
                                                key={d.id}
                                                type="button"
                                                className={`ble-device-item${selected ? " is-selected" : ""}`}
                                                onClick={() => setModalBtName(d.name)}
                                            >
                                                <span className="ble-device-item__check" aria-hidden>
                                                    {selected && <IoCheckmark />}
                                                </span>
                                                <span className="ble-device-item__name">{d.name}</span>
                                            </button>
                                        );
                                    })}
                                    {!scanning && scanResults !== null && scanResults.length === 0 && (
                                        <div className="ble-device-list__empty">
                                            {scanError || t("connection.noDevicesFound")}
                                        </div>
                                    )}
                                    {scanning && (!scanResults || scanResults.length === 0) && (
                                        <div className="ble-device-list__empty">{t("common.scanning")}</div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="cfg-field">
                            <label className="cfg-label">
                                {t("connection.deviceNameLabel")}
                            </label>
                            <input
                                maxLength={40}
                                className="form-control form-control--md cfg-input"
                                value={modalBtName}
                                onChange={e => setModalBtName(e.target.value)}
                                placeholder={t("connection.deviceNamePlaceholder")}
                            />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="cfg-field">
                            <label className="cfg-label">
                                Host
                            </label>
                            <input
                                maxLength={40}
                                className="form-control form-control--md cfg-input"
                                value={modalHost}
                                onChange={e => setModalHost(e.target.value)}
                            />
                        </div>
                        <div className="cfg-field">
                            <label className="cfg-label">
                                Port
                            </label>
                            <input
                                maxLength={5}
                                className="form-control form-control--md cfg-input"
                                value={modalPort}
                                onChange={e => setModalPort(e.target.value)}
                            />
                        </div>
                    </>
                )}

                <div className="cfg-field" style={{ marginBottom: 12 }}>
                    <label className="cfg-label">
                        {t("common.name")}
                    </label>
                    <input
                        maxLength={30}
                        className="form-control form-control--md cfg-input"
                        value={modalName}
                        onChange={e => setModalName(e.target.value)}
                        placeholder={
                            modalType === "ble"
                                ? t("connection.registeredNamePlaceholderBle")
                                : t("connection.registeredNamePlaceholderTcp")
                        }
                    />
                </div>
            </Modal>

            <Modal
                open={!!slotToDelete}
                onClose={closeDeleteModal}
                title={t("connection.deleteTitle")}
                footer={(
                    <>
                        <button className="btn btn--md" onClick={closeDeleteModal}>
                            {t("common.cancel")}
                        </button>
                        <button className="btn btn--md" onClick={deleteSlot}>
                            {t("common.delete")}
                        </button>
                    </>
                )}
            >
                <p>
                    {t("connection.deleteConfirmLine1", { id: slotToDelete?.name || "(no name)" })}<br />{t("connection.deleteConfirmLine2")}
                </p>
            </Modal>
        </div>
    );
}
