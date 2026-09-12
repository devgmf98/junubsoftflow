import { useEffect, useState, useCallback } from 'react';
import Icon from './Icon';

/**
 * Lightbox slider for review photos.
 * Opens at the thumbnail that was clicked; arrows / swipe / keyboard move through the set.
 */
export default function ImageSlider({ images = [], startIndex = 0, caption, captions = [], onClose }) {
  const [index, setIndex] = useState(startIndex);
  const [touchX, setTouchX] = useState(null);

  const count = images.length;
  const go = useCallback((delta) => setIndex((i) => (i + delta + count) % count), [count]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [go, onClose]);

  if (!count) return null;

  const onTouchEnd = (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    setTouchX(null);
  };

  return (
    <div className="slider-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <button className="slider-close" onClick={onClose} aria-label="Close">&times;</button>

      <div
        className="slider-stage"
        onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
        onTouchEnd={onTouchEnd}
      >
        {count > 1 && (
          <button className="slider-nav prev" onClick={() => go(-1)} aria-label="Previous image">
            &#8249;
          </button>
        )}

        <figure className="slider-figure">
          <img src={images[index]} alt={`${caption || 'Review image'} ${index + 1} of ${count}`} />
          <figcaption>
            <span>{captions[index] || caption || ''}</span>
            <span className="slider-count">{index + 1} / {count}</span>
          </figcaption>
        </figure>

        {count > 1 && (
          <button className="slider-nav next" onClick={() => go(1)} aria-label="Next image">
            &#8250;
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="slider-dots">
          {images.map((src, i) => (
            <button
              key={src}
              className={`slider-thumb ${i === index ? 'on' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`Go to image ${i + 1}`}
            >
              <img src={src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Thumbnail strip shown inside a review; clicking one opens the slider. */
export function ImageStrip({ images = [], caption }) {
  const [open, setOpen] = useState(null);
  if (!images.length) return null;

  return (
    <>
      <div className="review-shots">
        {images.map((src, i) => (
          <button
            key={src}
            className="review-shot"
            onClick={() => setOpen(i)}
            aria-label={`Open image ${i + 1} of ${images.length}`}
          >
            <img src={src} alt="" loading="lazy" />
            {i === images.length - 1 && images.length > 3 && (
              <span className="review-shot-more">
                <Icon name="eye" />
              </span>
            )}
          </button>
        ))}
      </div>

      {open !== null && (
        <ImageSlider images={images} startIndex={open} caption={caption} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
