/**
 * @description AutoSkill when it has points
 * @author Jaenster
 */


(function (module, require) {
	Worker = require('Worker');

	function skill(build) {
		// Checking if we can spend skill
		const spend = {};

		let continueLoop;
		do {
			continueLoop = false;
			for (let i = 0; i < build.length; i++) {
				if (!build.hasOwnProperty(i)) continue;

				const skillId = build[i][0];
				const wantedPoints = build[i][1],
					currentPoints = me.getSkill(skillId, 0);

				// Is this skill at the desired lvl?
				if (currentPoints >= wantedPoints) continue; // Next skill

				// Level you need to be, to skill this skill
				const conversionLevel = getBaseStat("skills", skillId, sdk.stats.ConversionLevel);

				// Is our lvl high enough to skill it?
				if (me.charlvl < conversionLevel) continue;

				// Is it allowed to skill this?
				// For example, your lvl 30 and want to put a second point in frozen orb. This isnt allowed
				if ((me.charlvl + 1 - conversionLevel) === me.getSkill(skillId, 0)) continue; // next

				const name = getSkillById(skillId);

				print('Skilling: ' + name);
				useSkillPoint(skillId); // Actually spending the point
				delay((me.ping * 3) + 50);

				// Define if not defined
				if (!spend.hasOwnProperty(name)) spend[name] = 0;

				// To keep track of what we skilled
				spend[name]++;

				// Still have skills? Keep on looping if we are on the end of the wanted skills list.
				continueLoop = me.getStat(sdk.stats.Newskills) > 0;
			}
		} while (continueLoop);

		for (let name in spend) {
			if (spend.hasOwnProperty(name)) {
				print('Skilled ' + name + ', +' + spend[name]);
			}
		}
		return true;
	}

	Worker.runInBackground.AutoSkill = function () {
		me.getStat(sdk.stats.Newskills) && skill(module.exports);
		return true;
	};

	module.exports = [// Example config
		/*

		// First the skills needed
		[Skills.Telekinesis, 1],
		[Skills.Teleport, 1],
		[Skills.FrozenArmor, 1],
		[Skills.Warmth, 1],
		[Skills.StaticField, 1],

		[Skills.FrostNova, 1], // <-- Frost nova is a pre needed skill
		[Skills.ColdMastery, 1], // <-- 1 skill before maxing the rest to be sure

		[Skills.Blizzard, 20],
		[Skills.IceBlast, 20],
		[Skills.GlacialSpike, 20],
		[Skills.IceBolt, 20],
		[Skills.ColdMastery, 20], // <-- max cold mastery to 20, last thing we do

	 */
	];

}).call(module, require);