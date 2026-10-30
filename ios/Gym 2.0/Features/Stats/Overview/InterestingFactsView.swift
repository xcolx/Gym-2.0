//
//  InterestingFactsView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 27.08.2024.
//

import SwiftUI
import SwiftData

struct InterestingFactsView: View {
    
    @Query(
        filter: #Predicate <Workout> {$0.inProgress == false}
    ) var workouts: [Workout]
    @Query var equipment: [Equipment]
    @Query var muscleGroups: [MuscleGroup]
    @Query(filter: #Predicate<User> { $0.isCurrentUser }) private var currentUsers: [User]
    @Environment(UserSettings.self) var userSettings
        
    var body: some View {
        let interestingFacts = InterestingFactsCalculator.facts(
            of: workouts,
            equipment: equipment,
            muscleGroups: muscleGroups,
            memberSince: currentUsers.first?.createdAt,
            weightUnit: userSettings.weightUnit,
            distanceUnit: userSettings.distanceUnit
        )
        ScrollView{
            VStack{
                ForEach(interestingFacts){ fact in
                    VStack{
                        
                        HStack{
                            Text(fact.title)
                                .font(.headline)
                            Spacer()
                            ShareLink(item: "Look at this cool fact the Gym 2.0 app told me about my workouts: \n \n" + fact.text){
                                Image(systemName: "square.and.arrow.up")
                                    .foregroundStyle(Color("MyBlack"))
                                    .font(.headline)
                                    .accessibilityLabel("Share fact")
                            }
                        }
                        .padding(.bottom, 5)
                        
                        Text(fact.text)
                            .frame(maxWidth: .infinity, alignment: .leading)

                    }
                    .padding(15)
                    .padding(.horizontal, 15)
                    .background(
                        RoundedRectangle(cornerRadius: 20)
                            .fill(Color("MyWhite"))
                            .padding(5)
                            .padding(.horizontal, 10)
                            .shadow(color: Color("MyBlack").opacity(0.5), radius: 5, x: 5, y: 5)
                    )
                }
                Text("more coming in the future ...")
                    .font(.footnote)
            }
        }
        .scrollContentBackground(.hidden)
        .navigationTitle("Interesting Facts")
    }
    
}
