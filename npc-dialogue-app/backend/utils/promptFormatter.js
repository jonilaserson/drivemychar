const fs = require('fs');
const path = require('path');

// Load prompt format configuration
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const promptConfig = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'prompt_format.json'), 'utf8'));
const npcConfig = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'npc-config.json'), 'utf8'));

function formatPrompt(npcData) {
    // Use the system prompt template from npc-config.json
    const npcPrompt = npcConfig.systemPrompt.template
        .replace('{name}', npcData.name)
        .replace('{description}', npcData.description)
        .replace('{personality}', npcData.personality)
        .replace('{currentScene}', npcData.currentScene)
        .replace('{whatTheyKnow}', npcData.whatTheyKnow.join('\n'))
        .replace('{pitfalls}', npcData.pitfalls.join('\n'))
        .replace('{motivations}', npcData.motivations.join('\n'));

    // Then append the common formatting instructions
    return `${npcPrompt}\n\n${promptConfig.promptFormat.instructions}`;
}

module.exports = {
    formatPrompt
}; 