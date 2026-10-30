//
//  WorkoutSchemesView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 14.08.2024.
//

import SwiftUI
import SwiftData

struct WorkoutSchemesView: View {
    
    @Binding var navigationStackPath: [NavigationDestination]
    
    let columns: [GridItem] = [
        GridItem(.flexible(), spacing: nil, alignment: nil),
        GridItem(.flexible(), spacing: nil, alignment: nil)
    ]
    
    @State var showEditDialog: Bool = false
    
    @Query(
        sort: [SortDescriptor(\WorkoutScheme.name, order: .forward)]
    ) var workoutSchemes: [WorkoutScheme]
    
    @Environment(UserSettings.self) var userSettings
    
    var body: some View {
        VStack(alignment: .leading){
            HStack{
                Text("Your Own Workouts:")
                    .font(.title)
                
                Spacer()
                
                Button(action: {
                    showEditDialog.toggle()
                }, label: {
                    Image(systemName: "pencil")
                        .font(.headline)
                        .foregroundStyle(Color("MyBlack"))
                        .accessibilityLabel("Edit a workout scheme")
                })
                
                NavigationLink(value: NavigationDestination.addScheme) {
                    Image(systemName: "plus.circle")
                        .padding(.trailing, 15)
                        .font(.headline)
                        .foregroundStyle(Color("MyBlack"))
                        .accessibilityLabel("Add workout scheme")
                }
                
            }
            
            
            ZStack {
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color("MyGray"))
                    .overlay(
                        ScrollView{
                            LazyVGrid(columns: columns) {
                                ForEach(workoutSchemes, id: \.persistentModelID){ scheme in
                                    Button(action: {
                                        navigationStackPath.append(.scheme(selectedScheme: scheme))
                                    }, label: {
                                        VStack {
                                            Text(scheme.name)
                                                .font(.title)
                                            if let lastPerformed = scheme.lastPerformed {
                                                Text(lastPerformed, format: .relative(presentation: .named))
                                                    .font(.caption)
                                            }
                                        }
                                            .padding(10)
                                            .foregroundStyle(Color("MyBlack"))
                                            .background(
                                                RoundedRectangle(cornerRadius: 20)
                                                    .fill(userSettings.appColor)
                                            )
                                    })
                                    .contextMenu {
                                            Button {
                                                navigationStackPath.append(.editScheme(selectedScheme: scheme))
                                            } label: {
                                                Label("Edit", systemImage: "pencil")
                                            }
                                        }
                                }
                            }
                        }
                        .padding(8)
                    )
            }

        }
        .confirmationDialog("Edit Workout", isPresented: $showEditDialog, titleVisibility: .visible) {
            ForEach(workoutSchemes, id: \.persistentModelID) { scheme in
                Button(scheme.name) {
                    navigationStackPath.append(.editScheme(selectedScheme: scheme))
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Choose the workout you would like to edit")
        }
        
    }
    
    
}
