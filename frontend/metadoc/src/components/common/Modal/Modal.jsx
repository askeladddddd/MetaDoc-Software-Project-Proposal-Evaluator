import React from 'react';
import { X, AlertCircle } from 'lucide-react';
import './Modal.css';

const Modal = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    type = 'default',
    showCloseButton = true,
    modalClassName = '',
}) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className={`modal-content ${type === 'error' ? 'modal-error' : ''} ${modalClassName}`.trim()}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    {type === 'error' && (
                        <div className="modal-icon error">
                            <AlertCircle size={24} />
                        </div>
                    )}
                    <h2 className="modal-title">{title}</h2>
                    {showCloseButton && (
                        <button className="modal-close-btn" onClick={onClose}>
                            <X size={24} />
                        </button>
                    )}
                </div>

                <div className="modal-body">
                    {children}
                </div>

                {footer && (
                    <div className="modal-footer">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Modal;
