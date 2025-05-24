import React from 'react';
import './AttitudeSelector.css';

const attitudes = [
  { id: 'hostile', label: 'Hostile', description: 'Openly hostile and aggressive' },
  { id: 'suspicious', label: 'Suspicious', description: 'Wary and distrustful' },
  { id: 'neutral', label: 'Neutral', description: 'Neither friendly nor hostile' },
  { id: 'open', label: 'Open', description: 'Willing to engage' },
  { id: 'friendly', label: 'Friendly', description: 'Generally well-disposed' },
  { id: 'trusting', label: 'Trusting', description: 'Fully trusts and receptive' }
];

const AttitudeSelector = ({ currentAttitude, onAttitudeChange, isGMMode }) => {
  if (!isGMMode) return null;

  return (
    <div className="attitude-selector">
      <h3>NPC Attitude</h3>
      <div className="attitude-options">
        {attitudes.map(attitude => (
          <button
            key={attitude.id}
            className={`attitude-option ${currentAttitude === attitude.id ? 'selected' : ''}`}
            onClick={() => onAttitudeChange(attitude.id)}
            title={attitude.description}
          >
            {attitude.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default AttitudeSelector; 